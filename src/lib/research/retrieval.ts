import { z } from 'zod';
import { fetchDocument, validateRemoteUrl } from './network';
import type { Source } from '../validation';
const searchSchema = z.object({
  results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string() })).max(10),
});
export type SearchResult = z.infer<typeof searchSchema>['results'][number];
export type Retrieved = Source & { text: string };
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error(`Search provider unavailable (HTTP ${response.status})`);
  const data = searchSchema.parse(await response.json());
  return data.results.filter((r) => {
    try {
      validateRemoteUrl(r.url);
      return true;
    } catch {
      return false;
    }
  });
}
export async function retrieve(
  results: SearchResult[],
  officialDomain: string,
  existing: Retrieved[] = [],
) {
  const unique = results
    .filter(
      (r, i, a) =>
        a.findIndex((s) => s.url === r.url) === i && !existing.some((s) => s.url === r.url),
    )
    .slice(0, Math.max(0, 9 - existing.length));
  const outcomes = await Promise.allSettled(unique.map((r) => fetchDocument(r.url)));
  const sources: Retrieved[] = [];
  const attempts: string[] = [];
  outcomes.forEach((result, i) => {
    const initial = unique[i];
    if (result.status === 'rejected') {
      attempts.push(
        `Could not retrieve ${initial.url}: ${result.reason instanceof Error ? result.reason.message : 'fetch failed'}`,
      );
      return;
    }
    const doc = result.value;
    const domain = new URL(doc.url).hostname;
    const official =
      domain === officialDomain ||
      domain.endsWith(`.${officialDomain}`) ||
      domain === 'docs.composio.dev';
    const id = `s${existing.length + sources.length + 1}`;
    sources.push({
      id,
      title: doc.title,
      url: doc.url,
      domain,
      type: official ? 'official' : 'third_party',
      accessedAt: new Date().toISOString(),
      summary:
        initial.content.slice(0, 900) ||
        'Retrieved public documentation; inspect this source for the cited requirements.',
      text: doc.text,
    });
    attempts.push(`Retrieved ${doc.url} (${doc.text.length} readable characters)`);
  });
  return { sources, attempts };
}
