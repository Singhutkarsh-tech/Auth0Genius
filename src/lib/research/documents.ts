import { Prisma } from '@prisma/client';
import { db } from '../db';
import { fetchDocument, validateRemoteUrl } from './network';
import { researchLimits } from './limits';
type Capture = Awaited<ReturnType<typeof fetchDocument>>;

/** Public documents only. The original fetch timestamp survives cache reads. */
export async function publicDocument(url: string, fresh = false, onNetwork?: () => void) {
  validateRemoteUrl(url);
  if (!fresh) {
    try {
      const saved = await db.publicDocument.findUnique({ where: { url } });
      if (saved && (saved.capture as { parserVersion?: number }).parserVersion === 2 && saved.expiresAt.getTime() > Date.now()) {
        const document = saved.capture as unknown as Capture;
        validateRemoteUrl(document.url);
        return { document, fetchedAt: saved.fetchedAt.toISOString(), cacheStatus: 'hit' as const };
      }
    } catch { /* Cache/schema availability must not block safe uncached retrieval. */ }
  }
  onNetwork?.();
  const document = await fetchDocument(url);
  const now = new Date();
  try {
    await db.publicDocument.upsert({
      where: { url },
      create: { url, capture: { ...document, parserVersion: 2 } as unknown as Prisma.InputJsonValue, fetchedAt: now, expiresAt: new Date(now.getTime() + researchLimits.cacheTtlMs) },
      update: { capture: { ...document, parserVersion: 2 } as unknown as Prisma.InputJsonValue, fetchedAt: now, expiresAt: new Date(now.getTime() + researchLimits.cacheTtlMs) },
    });
  } catch { /* Optional cache; guide publication still uses the required atomic transaction. */ }
  return { document, fetchedAt: now.toISOString(), cacheStatus: 'miss' as const };
}
