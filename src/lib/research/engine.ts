import { Prisma } from '@prisma/client';
import { db } from '../db';
import { saveGuide } from '../db/guides';
import { type Guide } from '../validation';
import {
  searchWeb,
  retrieve,
  providerDomains,
  providerReferenceResults,
  identityCandidates,
  providerDomain,
  type Retrieved,
} from './retrieval';
import { identifyProvider, synthesize, reconcileGuide } from './synthesis';
import { assertStageAdvance } from './state';
import { validateRemoteUrl } from './network';
import type { SearchResult } from './retrieval';
export type Context = {
  useCase?: string;
  identity?: { name: string; website: string };
  domain?: string;
  sources: Retrieved[];
  attempted: string[];
  draft?: Guide;
  identityOptions?: import('./synthesis').IdentityCandidate[];
  identityResults?: SearchResult[];
  chosenCandidateIndex?: number;
  identityUrl?: string;
};
export function configurationError() {
  const missing = ['OPENAI_API_KEY', 'TAVILY_API_KEY'].filter((k) => !process.env[k]);
  return missing.length
    ? `Live research is not configured. Add ${missing.join(' and ')} on the server to enable retrieval and guide synthesis. Saved guides remain available.`
    : null;
}
export type ExecutionResult = {
  claimed: boolean;
  outcome: 'advanced' | 'leased' | 'terminal' | 'superseded' | 'failed' | 'retry' | 'blocked';
  leaseUntil: string | null;
  retryAfterMs: number;
};
export function executionState(job: { status: string; leaseUntil: Date | null }) {
  const terminal = ['completed', 'failed'].includes(job.status);
  const blocked = job.status === 'blocked';
  const remaining = Math.max(0, (job.leaseUntil?.getTime() ?? 0) - Date.now());
  return {
    claimable: !terminal && !blocked && !remaining,
    blocked,
    leaseUntil: job.leaseUntil?.toISOString() ?? null,
    retryAfterMs: terminal || blocked ? 0 : remaining,
    terminal,
  };
}
export async function advanceJob(
  id: string,
  selection?: { candidateIndex?: number; officialUrl?: string },
): Promise<ExecutionResult> {
  if (selection?.candidateIndex !== undefined || selection?.officialUrl) {
    const current = await db.researchJob.findUnique({ where: { id } });
    if (current?.status === 'blocked' && current.currentStage === 0) {
      const context = current.context as unknown as Context;
      if (
        selection.candidateIndex !== undefined &&
        (!Number.isInteger(selection.candidateIndex) ||
          !context.identityResults?.[selection.candidateIndex])
      )
        return { claimed: false, outcome: 'blocked', leaseUntil: null, retryAfterMs: 0 };
      if (selection.officialUrl) {
        validateRemoteUrl(selection.officialUrl);
        const parsed = new URL(selection.officialUrl);
        if (parsed.protocol !== 'https:')
          return { claimed: false, outcome: 'blocked', leaseUntil: null, retryAfterMs: 0 };
        context.identityUrl = parsed.origin;
        context.chosenCandidateIndex = undefined;
        context.identityResults = undefined;
        context.identityOptions = undefined;
      }
      if (selection.candidateIndex !== undefined)
        context.chosenCandidateIndex = selection.candidateIndex;
      const selected = await db.researchJob.updateMany({
        where: { id, status: 'blocked', currentStage: 0 },
        data: {
          context: context as unknown as Prisma.InputJsonValue,
          status: 'queued',
          error: null,
        },
      });
      if (!selected.count)
        return { claimed: false, outcome: 'leased', leaseUntil: null, retryAfterMs: 500 };
    }
  }
  const now = new Date();
  const leaseUntil = new Date(Date.now() + 150000);
  const lease = await db.researchJob.updateMany({
    where: {
      id,
      status: { in: ['queued', 'running'] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: leaseUntil, status: 'running' },
  });
  if (!lease.count) {
    const current = await db.researchJob.findUniqueOrThrow({ where: { id } });
    const state = executionState(current);
    return {
      claimed: false,
      outcome: state.terminal ? 'terminal' : state.blocked ? 'blocked' : 'leased',
      leaseUntil: state.leaseUntil,
      retryAfterMs: state.retryAfterMs,
    };
  }
  const job = await db.researchJob.findUniqueOrThrow({ where: { id } });
  const context = job.context as unknown as Context;
  const fence = { id, currentStage: job.currentStage, leaseUntil, status: 'running' };
  try {
    const config = configurationError();
    if (config) throw new Error(config);
    if (Date.now() - job.startedAt.getTime() > 30 * 60 * 1000)
      throw new Error('This research session expired. Start a fresh investigation.');

    switch (job.currentStage) {
      case 0: {
        let found: SearchResult[];
        if (context.chosenCandidateIndex !== undefined && context.identityResults) {
          found = [context.identityResults[context.chosenCandidateIndex]];
        } else {
          try {
            found = await searchWeb(
              context.identityUrl
                ? `${new URL(context.identityUrl).hostname} OAuth developer API documentation official`
                : `${job.query} ${context.useCase ?? ''} official company product website`,
            );
          } catch (error) {
            if (!context.identityUrl) throw error;
            found = [];
            context.attempted.push('Search unavailable; validating the supplied website directly');
          }
        }
        if (context.identityUrl) {
          // Read the user-supplied page itself; search ranking cannot replace its identity.
          const supplied = await retrieve(
            [{ title: 'User supplied provider website', url: context.identityUrl, content: '' }],
            providerDomain(context.identityUrl),
          );
          context.attempted.push(...supplied.attempts);
          found = [...supplied.sources.map((source) => ({
            title: source.title,
            url: source.url,
            content: source.content ?? source.summary,
          })), ...found];
        }
        if (!context.identityUrl && !identityCandidates(found, job.query).length) {
          context.attempted.push(
            `Initial discovery had no provider-domain candidate: ${found.map((r) => r.url).join(', ')}`,
          );
          try {
            found = await searchWeb(
              `${job.query} ${context.useCase ?? ''} OAuth official developer documentation`,
            );
          } catch (error) {
            if (!context.identityUrl) throw error;
            context.attempted.push('Secondary search unavailable; supplied-site evidence retained');
          }
        }
        found = identityCandidates(found, context.identityUrl ?? job.query);
        context.attempted.push(
          'Searched for provider identity and official developer documentation',
          `Discovery URLs (not verified evidence): ${found.map((result) => result.url).join(', ')}`,
        );
        const identity = await identifyProvider(
          job.query,
          found,
          context.useCase,
          context.identityUrl,
        );
        if (identity.ambiguous) {
          context.identityOptions = identity.candidates;
          context.identityResults = identity.results;
          const blocked = await db.researchJob.updateMany({
            where: { id, currentStage: 0, leaseUntil, status: 'running' },
            data: {
              status: 'blocked',
              error: identity.reason || 'Confirm which provider you mean.',
              context: context as unknown as Prisma.InputJsonValue,
              leaseUntil: null,
            },
          });
          return {
            claimed: true,
            outcome: blocked.count ? 'blocked' : 'superseded',
            leaseUntil: null,
            retryAfterMs: 0,
          };
        }
        context.identity = identity;
        context.identityOptions = undefined;
        context.identityResults = undefined;
        context.chosenCandidateIndex = undefined;
        validateRemoteUrl(context.identity.website);
        context.attempted.push(
          `Selected observed provider identity origin: ${context.identity.website}`,
        );
        context.domain = providerDomain(context.identity.website);
        const retrieved = await retrieve(found.slice(0, 2), context.domain);
        context.sources.push(...retrieved.sources);
        context.attempted.push(...retrieved.attempts);
        break;
      }
      case 1: {
        let found: SearchResult[] = [];
        try {
          found = await searchWeb(
            `${context.identity!.name} API authentication login flow authorization scopes`,
            providerDomains(context.domain!),
          );
        } catch (error) {
          if (!providerReferenceResults(context.domain!, 'authentication').length) throw error;
          context.attempted.push('Search unavailable; checking the configured official authentication documentation');
        }
        const candidates = [
          ...providerReferenceResults(context.domain!, 'authentication'),
          ...found,
        ].filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index);
        const got = await retrieve(candidates.slice(0, 2), context.domain!, context.sources);
        context.sources.push(...got.sources);
        context.attempted.push('Searched for OAuth capability evidence', ...got.attempts);
        break;
      }
      case 2: {
        let found: SearchResult[] = [];
        try {
          found = await searchWeb(
            `${context.identity!.name} official developer app registration credentials redirect URL authentication documentation`,
            providerDomains(context.domain!),
          );
        } catch (error) {
          if (!providerReferenceResults(context.domain!, 'setup').length) throw error;
          context.attempted.push('Search unavailable; checking the configured official setup documentation');
        }
        const candidates = [
          ...providerReferenceResults(context.domain!, 'setup'),
          ...found,
        ].filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index);
        const got = await retrieve(candidates.slice(0, 2), context.domain!, context.sources);
        context.sources.push(...got.sources);
        context.attempted.push(
          'Searched for registration, scopes and redirect documentation',
          ...got.attempts,
        );
        const composio = await retrieve(
          [
            {
              title: 'Composio managed auth',
              url: 'https://docs.composio.dev/toolkits/managed-auth',
              content: 'Current managed OAuth toolkit documentation.',
            },
            {
              title: 'Composio custom auth',
              url: 'https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app',
              content: 'Managed and custom authentication routes.',
            },
          ],
          context.domain!,
          [],
        );
        const newSources = composio.sources.map((s, i) => ({ ...s, id: `c${i + 1}` }));
        context.sources.push(...newSources);
        context.attempted.push(
          'Checked Composio documentation for managed versus custom authentication',
          ...composio.attempts,
        );
        break;
      }
      case 3: {
        const found = await searchWeb(
          `${context.identity!.name} OAuth app review approval external distribution marketplace security verification`,
          providerDomains(context.domain!),
        );
        const got = await retrieve(
          found.slice(0, 3),
          context.domain!,
          context.sources.filter((s) => !s.id.startsWith('c')),
        );
        context.sources.push(...got.sources);
        context.attempted.push(
          'Searched official-domain review and distribution requirements',
          ...got.attempts,
        );
        if (!context.sources.length)
          throw new Error(
            'Documentation could not be retrieved. No factual guide can be generated.',
          );
        break;
      }
      case 4: {
        context.attempted.push(
          'Compared retrieved evidence and synthesized a structured guide using OpenAI',
        );
        context.draft = await synthesize(
          job.query,
          context.useCase,
          context.identity!,
          context.sources,
          context.attempted,
        );
        break;
      }
      case 5: {
        context.draft = reconcileGuide(context.draft!, context.sources);
        context.attempted.push(
          'Validated guide schema, source references and retrieved destination URLs',
        );
        context.draft.provenance.attempted = [...context.attempted];
        break;
      }
      case 6: {
        if (!context.draft) throw new Error('No validated guide is available');
        const safeSlug = context.draft.slug;
        const existing = await db.provider.findUnique({ where: { slug: safeSlug } });
        if (existing && existing.website !== context.draft.website)
          context.draft.slug = `${safeSlug}-${job.id.slice(-6)}`;
        const publication = await db.$transaction(async (tx) => {
          const current = await tx.researchJob.findFirst({ where: fence });
          if (!current) return false;
          const result = await saveGuide(context.draft!, { tx, publicationId: `research-${id}` });
          await tx.researchJob.update({
            where: { id },
            data: {
              currentStage: 7,
              completedStages: [0, 1, 2, 3, 4, 5, 6],
              context: context as unknown as Prisma.InputJsonValue,
              leaseUntil: null,
              status: 'completed',
              dedupKey: null,
              outputGuideId: result.id,
              outputSlug: result.slug,
              completedAt: new Date(),
            },
          });
          return true;
        }, {
          maxWait: 10000,
          timeout: 15000,
        });
        return {
          claimed: true,
          outcome: publication ? 'advanced' : 'superseded',
          leaseUntil: null,
          retryAfterMs: 0,
        };
      }
      default:
        throw new Error('Invalid research stage');
    }
    assertStageAdvance(job.currentStage, job.currentStage + 1);
    const updated = await db.researchJob.updateMany({
      where: fence,
      data: {
        currentStage: job.currentStage + 1,
        completedStages: [...(job.completedStages as number[]), job.currentStage],
        context: context as unknown as Prisma.InputJsonValue,
        leaseUntil: null,
        retryCount: 0,
      },
    });
    return {
      claimed: true,
      outcome: updated.count ? 'advanced' : 'superseded',
      leaseUntil: null,
      retryAfterMs: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research failed';
    const transient = isTransientResearchError(error);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
    console.error('Research stage failed', { jobId: id, stage: job.currentStage, code, transient });

    if (transient && job.retryCount < 2) {
      const retry = await db.researchJob.updateMany({
        where: fence,
        data: {
          error: sanitizeResearchError(message),
          retryCount: { increment: 1 },
          leaseUntil: null,
          context: context as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        claimed: true,
        outcome: retry.count ? 'retry' : 'superseded',
        leaseUntil: null,
        retryAfterMs: retry.count ? 1000 * (job.retryCount + 1) : 0,
      };
    }

    const failed = await db.researchJob.updateMany({
      where: fence,
      data: {
        status: 'failed',
        dedupKey: null,
        error: sanitizeResearchError(message),
        leaseUntil: null,
        context: context as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    return {
      claimed: true,
      outcome: failed.count ? 'failed' : 'superseded',
      leaseUntil: null,
      retryAfterMs: 0,
    };
  }
}
export function isTransientResearchError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    if (['P1001', 'P1002', 'P2024', 'P2028', 'P2034'].includes(String(error.code))) return true;
  }
  const message = error instanceof Error ? error.message : '';
  return /HTTP 5\d\d|timed? ?out|timeout|temporarily unavailable|ECONNRESET|socket hang up|fetch failed/i.test(
    message,
  );
}
export function sanitizeResearchError(message: string) {
  const missing = configurationError();
  if (missing && message === missing) return missing;
  if (
    /configured|identity|ambiguous|retrieved|documentation|expired|scope|structured|source|guide|URL|OAuth|provider/i.test(
      message,
    ) &&
    !/(sk-|tvly-|bearer|api_key)/i.test(message)
  )
    return message.slice(0, 500);
  return 'The research service could not complete this stage. Check the server configuration or retry later. No approval or setup action was performed.';
}
