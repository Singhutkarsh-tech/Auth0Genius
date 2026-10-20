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
  if (!expected || (process.env.RESEARCH_PUBLIC_ACCESS === 'true' && !code)) return true;
  const a = Buffer.from(code ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function consumeQuota(request: Request, publicAccess = false) {
  const hour = Math.floor(Date.now() / 3600000);
  const day = Math.floor(Date.now() / 86400000);
  const callerIp =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'local';
  const ip = createHash('sha256')
    .update(callerIp)
    .digest('hex')
    .slice(0, 24);
  await db.$transaction(async (tx) => {
    const limits = publicAccess
      ? ([
          [`public-global:${day}`, 10, 86400000],
          [`public-ip:${ip}:${day}`, 2, 86400000],
        ] as const)
      : ([
          [`global:${day}`, 30, 86400000],
          [`ip:${ip}:${hour}`, 5, 3600000],
        ] as const);
    for (const [id, limit, ttl] of limits) {
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
