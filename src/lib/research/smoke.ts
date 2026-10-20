import { matches } from '../providers';
import { validateEvidence, type Guide } from '../validation';
export type SmokeReport = {
  input: string;
  startedAt: string;
  outcome: 'running' | 'reused' | 'failed' | 'generated_pending_semantic_review';
  fresh: boolean;
  jobId?: string;
  outputUrl?: string;
  model?: string;
  stages: { status: string; stage: number; completedStages: number[] }[];
  sourceUrls: string[];
  attempted: string[];
  claims?: {
    topic: string;
    classification: string;
    text: string;
    status: string;
    passages: unknown;
  }[];
  error?: string;
};
export async function runLiveResearch(options: {
  base: string;
  input: string;
  accessCode?: string;
  fetcher?: typeof fetch;
  report: (report: SmokeReport) => void;
  sleep?: (ms: number) => Promise<void>;
}) {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = Date.now();
  const report: SmokeReport = {
    input: options.input,
    startedAt: new Date(started).toISOString(),
    outcome: 'running',
    fresh: false,
    stages: [],
    sourceUrls: [],
    attempted: [],
  };
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetcher(new URL(path, options.base), init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? `Research HTTP ${response.status}`);
    return data;
  };
  try {
    const before = await request(`/api/providers?q=${encodeURIComponent(options.input)}`);
    const existing = (before.providers as Guide[]).find((g) => matches(g, options.input, true));
    if (existing) {
      report.outcome = 'reused';
      report.outputUrl = new URL(`/providers/${existing.slug}`, options.base).href;
      report.error = 'Existing guide found. No fresh research was performed.';
      options.report(report);
      return report;
    }
    const created = await request('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: options.input, accessCode: options.accessCode }),
    });
    if (created.existing || created.duplicate || !created.jobId) {
      report.outcome = 'reused';
      report.error = 'The server reused a guide or active job; this is not fresh generation.';
      options.report(report);
      return report;
    }
    report.fresh = true;
    report.jobId = created.jobId;
    for (let attempts = 0; attempts < 150 && Date.now() - started < 30 * 60 * 1000; attempts++) {
      const state = await request(`/api/research/${created.jobId}`);
      report.model = state.model;
      report.stages.push({
        status: state.status,
        stage: state.currentStage,
        completedStages: state.completedStages,
      });
      report.sourceUrls = state.sources.map((s: { url: string }) => s.url);
      report.attempted = state.attempted;
      if (state.status === 'failed') throw new Error(state.error ?? 'Research failed');
      if (state.status === 'completed') {
        if (state.currentStage !== 7 || state.completedStages.join(',') !== '0,1,2,3,4,5,6')
          throw new Error('Research did not complete every backend stage');
        const output = new URL(state.outputUrl, options.base);
        const guides = await request(
          `/api/providers?q=${encodeURIComponent(output.pathname.split('/').pop()!)}`,
        );
        const saved = validateEvidence(
          guides.providers.find((g: Guide) => `/providers/${g.slug}` === output.pathname),
        );
        if (
          saved.provenance.method !== 'live_research' ||
          new Date(saved.generatedAt).getTime() < started
        )
          throw new Error('Saved output is not a fresh live-generated guide');
        if (!saved.sources.some((s) => s.capture === 'fetched' && s.content && s.contentHash))
          throw new Error('No retained fetched source evidence');
        report.outputUrl = output.href;
        report.outcome = 'generated_pending_semantic_review';
        report.claims = [
          ['oauth', saved.oauthStatus, saved.oauthEvidence],
          ['managed_auth', saved.managedAuth, saved.managedEvidence],
          ['approval', saved.approval, saved.approvalEvidence],
        ].map(([topic, classification, claim]) => {
          const c = claim as Guide['oauthEvidence'];
          return {
            topic: topic as string,
            classification: classification as string,
            text: c.text,
            status: c.status,
            passages: c.support?.references ?? [],
          };
        });
        options.report(report);
        return report;
      }
      options.report(report);
      if (state.execution && !state.execution.claimable) {
        await sleep(Math.min(5000, Math.max(250, state.execution.retryAfterMs + 50)));
        continue;
      }
      await request(`/api/research/${created.jobId}`, {
        method: 'POST',
        headers: { 'x-research-access-code': options.accessCode ?? '' },
      });
    }
    throw new Error('Research exceeded bounded smoke-run attempts');
  } catch (error) {
    report.outcome = 'failed';
    report.error = error instanceof Error ? error.message : 'Research failed';
    options.report(report);
    return report;
  }
}
