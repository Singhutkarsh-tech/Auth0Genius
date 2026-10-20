import { Prisma } from '@prisma/client';
import { db } from '../db';
import { saveGuide } from '../db/guides';
import { validateEvidence, type Guide } from '../validation';
import { searchWeb, retrieve, type Retrieved } from './retrieval';
import { identifyProvider, synthesize, reconcileGuide } from './synthesis';
import { assertStageAdvance, researchStages } from './state';
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
export async function advanceJob(id: string) {
  const now = new Date();
  const lease = await db.researchJob.updateMany({
    where: {
      id,
      status: { in: ['queued', 'running'] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: new Date(Date.now() + 150000), status: 'running' },
  });
  if (!lease.count) return;
  const job = await db.researchJob.findUniqueOrThrow({ where: { id } });
  const context = job.context as unknown as Context;
  try {
    const config = configurationError();
    if (config) throw new Error(config);
    if (Date.now() - job.startedAt.getTime() > 30 * 60 * 1000)
      throw new Error('This research session expired. Start a fresh investigation.');
    let result: { id: string; slug: string } | undefined;
    switch (job.currentStage) {
      case 0: {
        const found = await searchWeb(`${job.query} official developer OAuth documentation`);
        context.attempted.push(
          'Searched for provider identity and official developer documentation',
        );
        context.identity = await identifyProvider(job.query, found);
        validateRemoteUrl(context.identity.website);
        context.domain = new URL(context.identity.website).hostname.replace(/^www\./, '');
        const retrieved = await retrieve(found.slice(0, 2), context.domain);
        context.sources.push(...retrieved.sources);
        context.attempted.push(...retrieved.attempts);
        break;
      }
      case 1: {
        const found = await searchWeb(
          `site:${context.domain} ${context.identity!.name} OAuth authorization scopes`,
        );
        const got = await retrieve(found.slice(0, 2), context.domain!, context.sources);
        context.sources.push(...got.sources);
        context.attempted.push('Searched for OAuth capability evidence', ...got.attempts);
        break;
      }
      case 2: {
        const found = await searchWeb(
          `${context.identity!.name} official developer register OAuth app redirect URI scopes documentation`,
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
          `site:${context.domain} OAuth app review approval external distribution marketplace security verification`,
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
        context.draft = reconcileGuide(validateEvidence(context.draft), context.sources);
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
        result = await saveGuide(context.draft);
        break;
      }
      default:
        throw new Error('Invalid research stage');
    }
    assertStageAdvance(job.currentStage, job.currentStage + 1);
    const complete = job.currentStage === researchStages.length - 1;
    await db.researchJob.update({
      where: { id },
      data: {
        currentStage: job.currentStage + 1,
        completedStages: [...(job.completedStages as number[]), job.currentStage],
        context: context as unknown as Prisma.InputJsonValue,
        leaseUntil: null,
        ...(complete
          ? {
              status: 'completed',
              dedupKey: null,
              outputGuideId: result!.id,
              outputSlug: result!.slug,
              completedAt: new Date(),
            }
          : {}),
      },
    });
  } catch (error) {
    console.error('Research stage failed:', error);
    const message = error instanceof Error ? error.message : 'Research failed';
    await db.researchJob.update({
      where: { id },
      data: {
        status: 'failed',
        dedupKey: null,
        error: sanitizeResearchError(message),
        leaseUntil: null,
        context: context as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }
}
export function sanitizeResearchError(message: string) {
  if (
    /configured|identity|ambiguous|retrieved|documentation|expired|scope|structured|source|guide|URL|OAuth|provider/i.test(
      message,
    ) &&
    !/(sk-|tvly-|bearer|api_key)/i.test(message)
  )
    return message.slice(0, 500);
  return 'The research service could not complete this stage. Check the server configuration or retry later. No approval or setup action was performed.';
}
