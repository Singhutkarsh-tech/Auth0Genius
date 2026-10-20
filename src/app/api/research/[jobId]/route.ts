import { db } from '@/lib/db';
import { advanceJob, type Context } from '@/lib/research/engine';
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
    status: job.status,
    currentStage: job.currentStage,
    completedStages: job.completedStages,
    error: job.error,
    outputUrl: job.outputSlug ? `/providers/${job.outputSlug}` : null,
    attempted: context.attempted,
    sources: context.sources.map((s) => ({ id: s.id, title: s.title, url: s.url, type: s.type })),
    startedAt: job.startedAt,
    completedAt: job.completedAt,
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
    await advanceJob(jobId);
    return Response.json(await publicJob(jobId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Research advancement failed', error);
    return errorJson('Could not advance research. Retry this stage later.', 503);
  }
}
