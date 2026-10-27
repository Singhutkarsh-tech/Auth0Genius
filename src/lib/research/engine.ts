import { Prisma } from '@prisma/client';
import { db } from '../db';
import { saveGuide } from '../db/guides';
import { type Guide } from '../validation';
import {
  searchWeb,
  retrieve,
  identityCandidates,
  providerDomain,
  type Retrieved,
} from './retrieval';
import { identifyProvider, synthesize, reconcileGuide } from './synthesis';
import { assertStageAdvance } from './state';
import { validateRemoteUrl } from './network';
import { parseResearchTarget, sameOfficialDomain } from './identity';
import { emptyMetrics, researchLimits, type ResearchMetrics } from './limits';
import { researchQuestions, recoverEvidenceGaps } from './questions';
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
  identityConfirmation?: { method: 'candidate' | 'explicit_url' | 'saved_provider'; website: string; confirmedAt: string };
  selectionState?: 'discovering' | 'awaiting_provider_selection' | 'confirmed';
  identityCaptures?: Retrieved[];
  refresh?: boolean;
  providerSlug?: string;
  metrics?: ResearchMetrics;
  coverage?: import('./questions').ResearchEvidenceContext['coverage'];
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
    if (!current) throw new Error('Research job not found');
    const context = current.context as unknown as Context;
    if (context.identityConfirmation) throw new Error('Provider identity is locked for this investigation');
    if (current.status !== 'blocked' || current.currentStage !== 0)
      throw new Error('Provider selection is not currently requested');
    if (selection.candidateIndex !== undefined) {
      const candidate = context.identityOptions?.[selection.candidateIndex];
      if (!Number.isInteger(selection.candidateIndex) || !candidate) throw new Error('Choose one of the listed provider candidates');
      validateRemoteUrl(candidate.website);
      context.identity = { name: candidate.name, website: candidate.website };
      context.identityUrl = candidate.website;
      context.identityConfirmation = { method: 'candidate', website: candidate.website, confirmedAt: new Date().toISOString() };
      context.selectionState = 'confirmed';
    } else if (selection.officialUrl) {
      const target = parseResearchTarget(selection.officialUrl);
      if (target.kind === 'name') throw new Error('Enter a public HTTPS provider website');
      context.identityUrl = target.url;
      context.identity = undefined;
      context.selectionState = 'discovering';
    }
    const selected = await db.researchJob.updateMany({
      where: { id, status: 'blocked', currentStage: 0 },
      data: { context: context as unknown as Prisma.InputJsonValue, status: 'queued', error: null },
    });
    if (!selected.count) return { claimed: false, outcome: 'leased', leaseUntil: null, retryAfterMs: 500 };
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
  context.metrics ??= emptyMetrics();
  const stageStarted = Date.now();
  const measure = (outcome: string) => context.metrics!.stages.push({ stage: job.currentStage, durationMs: Date.now() - stageStarted, outcome });
  const fence = { id, currentStage: job.currentStage, leaseUntil, status: 'running' };
  try {
    const config = configurationError();
    if (config) throw new Error(config);
    if (Date.now() - job.startedAt.getTime() > 30 * 60 * 1000)
      throw new Error('This research session expired. Start a fresh investigation.');

    if (job.currentStage > 0 && (!context.identityConfirmation || !context.identity || context.selectionState !== 'confirmed' || !sameOfficialDomain(context.identity.website, context.identityConfirmation.website)))
      throw new Error('Provider confirmation is required before OAuth research can advance');
    switch (job.currentStage) {
      case 0: {
        if (context.identityConfirmation && context.identity) {
          if (!sameOfficialDomain(context.identity.website, context.identityConfirmation.website)) throw new Error('Confirmed provider identity changed');
          context.domain = providerDomain(context.identity.website);
          const selectedCapture = context.identityCaptures?.filter((source) => sameOfficialDomain(source.url, context.identity!.website)) ?? [];
          for (const source of selectedCapture) if (!context.sources.some((s) => s.url === source.url)) context.sources.push(source);
          if (!selectedCapture.length) {
            const fetched = await retrieve([{ title: context.identity.name, url: context.identityUrl!, content: '' }], context.domain, context.sources, { metrics: context.metrics });
            if (fetched.sources.some((source) => !sameOfficialDomain(source.url, context.identity!.website))) throw new Error('Selected provider redirected to a conflicting identity; start a fresh investigation');
            context.sources.push(...fetched.sources);
            context.attempted.push(...fetched.attempts);
          }
          context.attempted.push(`User confirmed provider identity: ${context.identity.name} (${context.identity.website}). Selection establishes intent, not OAuth capability.`);
          break;
        }
        let found: SearchResult[] = [];
        if (context.identityUrl) {
          found = [{ title: 'User supplied provider website', url: context.identityUrl, content: '' }];
        } else {
          found = await searchWeb(`${job.query} ${context.useCase ?? ''} official company product website`, [], context.metrics);
          if (!identityCandidates(found, job.query).length) {
            found = await searchWeb(`${job.query} official developer API website`, [], context.metrics);
            context.attempted.push('Initial provider discovery had no credible match; attempted one bounded fallback.');
          }
        }
        const discovery = await identifyProvider(job.query, found, context.useCase, context.identityUrl, context.metrics);
        context.identityCaptures = discovery.captures ?? [];
        context.identityOptions = discovery.candidates ?? [];
        context.identityResults = discovery.results ?? found;
        context.attempted.push('Discovered provider candidates from public page evidence. No OAuth research has started.');
        // Even a model/stub returning ambiguous=false cannot confirm a name-based request.
        const explicitAccepted = context.identityUrl && !discovery.ambiguous && 'website' in discovery && typeof discovery.website === 'string' && sameOfficialDomain(discovery.website, context.identityUrl);
        if (!explicitAccepted) {
          context.selectionState = 'awaiting_provider_selection';
          measure('awaiting_provider_selection');
          const blocked = await db.researchJob.updateMany({ where: fence, data: { status: 'blocked', error: discovery.reason ?? 'Select the intended provider or enter its website.', context: context as unknown as Prisma.InputJsonValue, leaseUntil: null } });
          return { claimed: true, outcome: blocked.count ? 'blocked' : 'superseded', leaseUntil: null, retryAfterMs: 0 };
        }
        context.identity = { name: discovery.name!, website: discovery.website! };
        context.identityConfirmation = { method: 'explicit_url', website: context.identity.website, confirmedAt: new Date().toISOString() };
        context.selectionState = 'confirmed';
        context.domain = providerDomain(context.identity.website);
        context.sources.push(...(discovery.captures ?? []).filter((source) => sameOfficialDomain(source.url, context.identity!.website)));
        context.attempted.push(`Validated the supplied website identity: ${context.identity.name} (${context.identity.website}).`);
        break;
      }
      case 1:
        await researchQuestions(context, ['oauth']);
        break;
      case 2:
        await researchQuestions(context, ['setup', 'scopes', 'managed_auth']);
        break;
      case 3: {
        const deadline = Date.now() + researchLimits.stageDeadlineMs;
        await researchQuestions(context, ['approval'], false, deadline);
        await recoverEvidenceGaps(context, deadline);
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
          context.metrics,
        );
        break;
      }
      case 5: {
        if (!context.draft || !sameOfficialDomain(context.draft.website, context.identity!.website) || context.draft.name !== context.identity!.name) throw new Error('Guide identity does not match the confirmed provider');
        context.draft = reconcileGuide(context.draft!, context.sources);
        context.attempted.push(
          'Validated guide schema, source references and retrieved destination URLs',
        );
        context.draft.provenance.attempted = [...context.attempted];
        break;
      }
      case 6: {
        if (!context.draft) throw new Error('No validated guide is available');
        if (context.providerSlug) context.draft.slug = context.providerSlug;
        const safeSlug = context.draft.slug;
        const existing = await db.provider.findUnique({ where: { slug: safeSlug } });
        if (existing && !sameOfficialDomain(existing.website, context.draft.website))
          context.draft.slug = `${safeSlug}-${job.id.slice(-6)}`;
        const publication = await db.$transaction(async (tx) => {
          const current = await tx.researchJob.findFirst({ where: fence });
          if (!current) return false;
          const result = await saveGuide(context.draft!, { tx, publicationId: `research-${id}` });
          measure('completed');
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
    measure('completed');
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
    measure('failed');
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
    !/(sk-|tvly-|bearer|api_key|postgres|DATABASE_URL|https?:\/\/[^\s/]*@)/i.test(message)
  )
    return message.slice(0, 500);
  return 'The research service could not complete this stage. Check the server configuration or retry later. No approval or setup action was performed.';
}
