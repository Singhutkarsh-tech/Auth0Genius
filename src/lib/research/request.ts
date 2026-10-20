import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from '../db';
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return (
    !origin || origin === new URL(request.url).origin || origin === process.env.NEXT_PUBLIC_APP_URL
  );
}
export function validAccessCode(code?: string) {
  const expected = process.env.RESEARCH_ACCESS_CODE;
  if (!expected) return true;
  const a = Buffer.from(code ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function consumeQuota(request: Request) {
  const hour = Math.floor(Date.now() / 3600000);
  const day = Math.floor(Date.now() / 86400000);
  const ip = createHash('sha256')
    .update(request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local')
    .digest('hex')
    .slice(0, 24);
  await db.$transaction(async (tx) => {
    for (const [id, limit, ttl] of [
      [`global:${day}`, 30, 86400000],
      [`ip:${ip}:${hour}`, 5, 3600000],
    ] as const) {
      const quota = await tx.researchQuota.upsert({
        where: { id },
        create: { id, expiresAt: new Date(Date.now() + ttl) },
        update: { count: { increment: 1 } },
      });
      if (quota.count > limit) throw new Error('RATE_LIMIT');
    }
  });
}
export const errorJson = (message: string, status = 400) =>
  Response.json({ error: { message } }, { status });
