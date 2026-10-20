import type { ExecutionResult } from './engine';
export type PublicJob = {
  id: string;
  query: string;
  identity?: { name: string; website: string } | null;
  status: 'queued' | 'running' | 'blocked' | 'completed' | 'failed';
  currentStage: number;
  completedStages: number[];
  error: string | null;
  outputUrl: string | null;
  attempted: string[];
  sources: { id: string; title: string; url: string; type: string }[];
  identityCandidates: {
    index: number;
    name: string;
    website: string;
    description: string;
    evidenceUrl: string;
    evidenceSummary: string;
  }[];
  execution?: {
    claimable: boolean;
    blocked: boolean;
    leaseUntil: string | null;
    retryAfterMs: number;
    terminal: boolean;
  };
  executionResult?: ExecutionResult;
};
export function startResearchLoop(options: {
  jobId: string;
  accessCode: string;
  onJob: (job: PublicJob) => void;
  onError: (message: string) => void;
  onRunning: (running: boolean) => void;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const started = now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let failures = 0;
  let advances = 0;
  const later = (delay: number) => {
    if (!cancelled) timer = setTimeout(tick, Math.max(200, Math.min(8000, delay)));
  };
  const request = async (method: 'GET' | 'POST') => {
    const response = await fetcher(`/api/research/${options.jobId}`, {
      method,
      cache: 'no-store',
      headers: method === 'POST' ? { 'x-research-access-code': options.accessCode } : {},
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(140000)]),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message ?? 'Research request interrupted');
      Object.assign(error, { terminal: [401, 403, 404].includes(response.status) });
      throw error;
    }
    return data as PublicJob;
  };
  async function tick() {
    if (cancelled) return;
    if (now() - started > 30 * 60 * 1000 || advances >= 150) {
      options.onError('Automatic research retry limit reached. Reopen this saved job to resume.');
      return;
    }
    try {
      let job = await request('GET');
      if (cancelled) return;
      options.onJob(job);
      if (['completed', 'failed', 'blocked'].includes(job.status)) {
        options.onError('');
        return;
      }
      if (job.execution && !job.execution.claimable) {
        options.onRunning(false);
        later(Math.min(2500, job.execution.retryAfterMs + 50));
        return;
      }
      options.onRunning(true);
      advances++;
      job = await request('POST');
      if (cancelled) return;
      options.onJob(job);
      options.onError('');
      failures = 0;
      if (!['completed', 'failed', 'blocked'].includes(job.status))
        later(
          job.executionResult?.outcome === 'leased'
            ? Math.min(2500, job.executionResult.retryAfterMs + 50)
            : job.executionResult?.outcome === 'retry'
              ? Math.min(8000, job.executionResult.retryAfterMs)
              : 350,
        );
    } catch (error) {
      if (cancelled) return;
      failures++;
      const message = error instanceof Error ? error.message : 'Research interrupted';
      if ((error as { terminal?: boolean }).terminal || failures > 6) {
        options.onError(`${message}. Automatic retries stopped; reopen the saved job to resume.`);
        return;
      }
      options.onError(`${message}. Retrying automatically (${failures}/6).`);
      later(Math.min(8000, 500 * 2 ** (failures - 1)));
    } finally {
      if (!cancelled) options.onRunning(false);
    }
  }
  void tick();
  return () => {
    cancelled = true;
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}
