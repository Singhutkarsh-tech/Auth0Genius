import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { researchInput } from '@/lib/validation';
import { normalize, matches } from '@/lib/providers';
import { listGuides } from '@/lib/db/guides';
import { configurationError } from '@/lib/research/engine';
import { consumeQuota, errorJson, sameOrigin, validAccessCode } from '@/lib/research/request';
import { parseResearchTarget, sameOfficialDomain } from '@/lib/research/identity';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorJson('Cross-origin requests are not accepted.', 403);
  if (Number(request.headers.get('content-length') ?? 0) > 4096)
    return errorJson('Request too large.', 413);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return errorJson('Request too large.', 413);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return errorJson('Send a JSON request with a provider query.');
    }
    const parsed = researchInput.safeParse(json);
    if (!parsed.success)
      return errorJson('Enter a provider name or a public HTTPS website URL (2–200 characters).');
    const { query, useCase, accessCode } = parsed.data;
    let target;
    try {
      target = parseResearchTarget(query);
    } catch {
      return errorJson(
        'Use a public HTTPS provider website. Private addresses and unsupported URL formats are not accepted.',
      );
    }
    if (!validAccessCode(accessCode))
      return errorJson('A valid research access code is required for this deployment.', 401);
    const library = await listGuides();
    const existing = library.find((g) =>
      target.kind === 'name'
        ? matches(g, query, true)
        : (() => {
            try {
              return sameOfficialDomain(new URL(g.website).hostname, target.domain);
            } catch {
              return false;
            }
          })(),
    );
    if (existing && !useCase)
      return Response.json({ existing: true, url: `/providers/${existing.slug}` });
    const normalizedInput = target.kind === 'name' ? query : target.domain;
    const normalizedProvider = `${normalize(normalizedInput)}:${createHash('sha256')
      .update(useCase ?? '')
      .digest('hex')
      .slice(0, 12)}`;
    const recent = new Date(Date.now() - 30 * 60 * 1000);
    const duplicate = await db.researchJob.findFirst({
      where: {
        normalizedProvider,
        status: { in: ['queued', 'running', 'blocked'] },
        startedAt: { gt: recent },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (duplicate)
      return Response.json({
        jobId: duplicate.id,
        url: `/research/${duplicate.id}`,
        duplicate: true,
      });
    await consumeQuota(
      request,
      !process.env.RESEARCH_ACCESS_CODE || process.env.RESEARCH_PUBLIC_ACCESS === 'true',
    );
    const config = configurationError();
    await db.researchJob.updateMany({
      where: { dedupKey: normalizedProvider, startedAt: { lte: recent } },
      data: {
        dedupKey: null,
        status: 'failed',
        error: 'This research session expired. Start a new investigation.',
        completedAt: new Date(),
      },
    });
    const job = await db.researchJob.upsert({
      where: { dedupKey: normalizedProvider },
      update: {},
      create: {
        query,
        normalizedProvider,
        dedupKey: config ? null : normalizedProvider,
        status: config ? 'failed' : 'queued',
        error: config,
        completedAt: config ? new Date() : null,
        completedStages: [],
        context: {
          ...(useCase ? { useCase } : {}),
          ...(target.kind !== 'name' ? { identityUrl: target.url } : {}),
          sources: [],
          attempted: [],
        },
      },
    });
    return Response.json({ jobId: job.id, url: `/research/${job.id}` }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMIT')
      return errorJson(
        'Research limit reached. Try again later; saved guides are still available.',
        429,
      );
    console.error('Research creation failed', error);
    return errorJson(
      'Research storage is unavailable. Please retry later; existing guides remain available.',
      503,
    );
  }
}
