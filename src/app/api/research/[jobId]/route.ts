import { db } from '@/lib/db';
import { advanceJob, executionState, type Context } from '@/lib/research/engine';
import { errorJson, sameOrigin, validAccessCode } from '@/lib/research/request';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
type Params = { params: Promise<{ jobId: string }> };
async function publicJob(id: string) {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  const job = await db.researchJob.findUnique({ where: { id } });
  if (!job) return null;
  const context = job.context as unknown as Context;
  return {
    id: job.id,
    query: job.query,
    identity: context.identity ?? null,
    selectionState: context.selectionState ?? 'discovering',
    identityConfirmation: context.identityConfirmation ?? null,
    metrics: context.metrics ?? null,
    coverage: context.coverage ?? null,
    status: job.status,
    currentStage: job.currentStage,
    completedStages: job.completedStages,
    error: job.error,
    outputUrl: job.outputSlug ? `/providers/${job.outputSlug}` : null,
    attempted: context.attempted,
    sources: context.sources.map((s) => ({ id: s.id, title: s.title, url: s.url, type: s.type })),
    identityCandidates: context.identityOptions?.map((candidate, index) => ({
      index,
      name: candidate.name,
      website: candidate.website,
      description: candidate.description,
      evidenceUrl: candidate.evidenceUrl,
      evidenceSummary: candidate.evidenceSummary,
    })) ?? [],
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    outputGuideId: job.outputGuideId,
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    execution: executionState(job),
  };
}
export async function GET(_request: Request, { params }: Params) {
  try {
    const job = await publicJob((await params).jobId);
    return job
      ? Response.json(job, { headers: { 'Cache-Control': 'no-store' } })
      : errorJson('Research job not found.', 404);
  } catch {
    return errorJson('Research storage is temporarily unavailable.', 503);
  }
}
export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return errorJson('Cross-origin requests are not accepted.', 403);
  if (!validAccessCode(request.headers.get('x-research-access-code') ?? undefined))
    return errorJson('A valid research access code is required.', 401);
  const { jobId } = await params;
  try {
    const job = await publicJob(jobId);
    if (!job) return errorJson('Research job not found.', 404);
    let selection: { candidateIndex?: number; officialUrl?: string } | undefined;
    const body = await request.text();
    if (body.length > 2048) return errorJson('Identity confirmation is too large.', 413);
    if (body) {
      try {
        const value = JSON.parse(body) as { candidateIndex?: unknown; officialUrl?: unknown };
        if (value.candidateIndex !== undefined) {
          if (!Number.isInteger(value.candidateIndex) || Number(value.candidateIndex) < 0)
            return errorJson('Choose one of the listed provider candidates.');
          selection = { candidateIndex: Number(value.candidateIndex) };
        } else if (typeof value.officialUrl === 'string') {
          const parsed = new URL(value.officialUrl);
          if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
            return errorJson('Enter a public HTTPS provider website.');
          selection = { officialUrl: parsed.toString() };
        } else return errorJson('Choose a provider candidate or enter its official website.');
      } catch {
        return errorJson('Enter a valid provider candidate selection.');
      }
    }
    const executionResult = await advanceJob(jobId, selection);
    return Response.json(
      { ...(await publicJob(jobId)), executionResult },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Error && /identity is locked|selection is not currently|listed provider/.test(error.message)) return errorJson(error.message, 409);
    console.error('Research advancement failed', { kind: error instanceof Error ? error.name : 'unknown' });
    return errorJson('Could not advance research. Retry this stage later.', 503);
  }
}
