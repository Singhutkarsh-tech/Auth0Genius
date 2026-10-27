import { Prisma } from '@prisma/client';
import { db } from '../db';
import { saveGuide } from '../db/guides';
import { type Guide } from '../validation';
import {
  searchWeb,
  retrieve,
  providerDomains,
  identityCandidates,
  providerDomain,
  type Retrieved,
} from './retrieval';
import { identifyProvider, synthesize, reconcileGuide } from './synthesis';
import { assertStageAdvance } from './state';
import { validateRemoteUrl } from './network';
export type Context = {
  useCase?: string;
  identity?: { name: string; website: string };
  domain?: string;
  sources: Retrieved[];
  attempted: string[];
  draft?: Guide;
};
export function configurationError() {
  const missing = ['OPENAI_API_KEY', 'TAVILY_API_KEY'].filter((k) => !process.env[k]);
  return missing.length
    ? `Live research is not configured. Add ${missing.join(' and ')} on the server to enable retrieval and guide synthesis. Saved guides remain available.`
    : null;
}
export type ExecutionResult = {
  claimed: boolean;
  outcome: 'advanced' | 'leased' | 'terminal' | 'superseded' | 'failed' | 'retry';
  leaseUntil: string | null;
  retryAfterMs: number;
};
export function executionState(job: { status: string; leaseUntil: Date | null }) {
  const terminal = ['completed', 'failed'].includes(job.status);
  const remaining = Math.max(0, (job.leaseUntil?.getTime() ?? 0) - Date.now());
  return {
    claimable: !terminal && !remaining,
    leaseUntil: job.leaseUntil?.toISOString() ?? null,
    retryAfterMs: terminal ? 0 : remaining,
    terminal,
  };
}
export async function advanceJob(id: string): Promise<ExecutionResult> {
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
      outcome: state.terminal ? 'terminal' : 'leased',
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
        let found = await searchWeb(`${job.query} official website`);
        if (!identityCandidates(found, job.query).length) {
          context.attempted.push(
            `Initial discovery had no provider-domain candidate: ${found.map((r) => r.url).join(', ')}`,
          );
          found = await searchWeb(`${job.query} OAuth official developer documentation`);
        }
        found = identityCandidates(found, job.query);
        context.attempted.push(
          'Searched for provider identity and official developer documentation',
          `Discovery URLs (not verified evidence): ${found.map((result) => result.url).join(', ')}`,
        );
        context.identity = await identifyProvider(job.query, found);
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
        const found = await searchWeb(
          `${context.identity!.name} OAuth authorization scopes`,
          providerDomains(context.domain!),
        );
        const got = await retrieve(found.slice(0, 2), context.domain!, context.sources);
        context.sources.push(...got.sources);
        context.attempted.push('Searched for OAuth capability evidence', ...got.attempts);
        break;
      }
      case 2: {
        const found = await searchWeb(
          `${context.identity!.name} official developer register OAuth app redirect URI scopes documentation`,
          providerDomains(context.domain!),
        );
        const got = await retrieve(found.slice(0, 2), context.domain!, context.sources);
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
    console.error('Research stage failed:', sanitizeResearchError(message));
    if (job.currentStage === 6) {
      const released = await db.researchJob.updateMany({
        where: fence,
        data: { leaseUntil: null, error: 'Publication interrupted; retrying the same saved job.' },
      });
      return {
        claimed: true,
        outcome: released.count ? 'retry' : 'superseded',
        leaseUntil: null,
        retryAfterMs: 1000,
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
