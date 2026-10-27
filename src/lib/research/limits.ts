// One bounded investigation. Counters live in ResearchJob.context across stage retries.
export const researchLimits = {
  searches: 11,
  fetches: 20,
  sources: 12,
  concurrency: 3,
  searchTimeoutMs: 16000,
  stageDeadlineMs: 120000,
  cacheTtlMs: 6 * 60 * 60 * 1000,
  evidenceCharacters: 20000,
  modelOutputTokens: 2600,
} as const;
export type ResearchMetrics = {
  searches: number;
  fetches: number;
  cacheHits: number;
  documentReads?: number;
  stages: { stage: number; durationMs: number; outcome: string }[];
  model?: { name: string; inputTokens: number; outputTokens: number; durationMs: number; inputCharacters: number; legacyInputCharacters: number };
};
export const emptyMetrics = (): ResearchMetrics => ({ searches: 0, fetches: 0, cacheHits: 0, stages: [] });
export async function boundedMap<T, R>(items: T[], work: (item: T) => Promise<R>, concurrency = researchLimits.concurrency) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = { status: 'fulfilled', value: await work(items[index]) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}
