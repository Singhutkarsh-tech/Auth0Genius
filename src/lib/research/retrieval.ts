import { z } from 'zod';
import { createHash } from 'node:crypto';
import { fetchDocument, validateRemoteUrl } from './network';
import type { Source } from '../validation';
const searchSchema = z.object({
  results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string() })).max(10),
});
export type SearchResult = z.infer<typeof searchSchema>['results'][number];
export type Retrieved = Source & { text: string };
// Reviewed ownership mappings; an LLM-supplied host is never added to this list.
export function providerDomains(homepage: string) {
  const host = homepage.replace(/^www\./, '');
  const mappings: Record<string, string[]> = {
    'gmail.com': ['developers.google.com', 'support.google.com'],
    'slack.com': ['docs.slack.dev', 'api.slack.com'],
    'outlook.com': ['learn.microsoft.com'],
    'notion.com': ['developers.notion.com'],
    'notion.so': ['developers.notion.com'],
    'dropbox.com': ['docs.dropboxapi.com', 'developers.dropbox.com'],
    'salesforce.com': ['developer.salesforce.com'],
    'github.com': ['docs.github.com'],
    'zoom.us': ['developers.zoom.us'],
    'hubspot.com': ['developers.hubspot.com'],
  };
  return [host, ...(mappings[host] ?? [])];
}
export function sourceTopics(text: string): Source['topics'] {
  const topics: Source['topics'] = ['general'];
  if (/oauth|authorization code/i.test(text)) topics.push('oauth');
  if (/managed (?:auth|app|credential)|composio.managed/i.test(text)) topics.push('managed_auth');
  if (/review|approval|consent|distribution|verification|publish/i.test(text))
    topics.push('approval');
  if (/scope|permission/i.test(text)) topics.push('scopes');
  if (/register|configur|connect|redirect|install|application/i.test(text)) topics.push('setup');
  return topics; // Discovery tags only: they do not establish semantic support.
}
export function identityCandidates(results: SearchResult[], query: string) {
  const name = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length > 2 && !['com', 'org', 'net', 'app', 'dev', 'www', 'https', 'http'].includes(t),
    );
  let inputHost: string | undefined;
  try {
    const hint = /^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(query) ? `https://${query}` : query;
    inputHost = new URL(hint).hostname.replace(/^www\./, '');
  } catch {
    /* Name input. */
  }
  const aggregators = [
    'wikipedia.org',
    'linkedin.com',
    'leadiq.com',
    'reddit.com',
    'youtube.com',
    'quora.com',
    'medium.com',
    'apps.make.com',
    'community.retool.com',
    'developer.transmitsecurity.com',
  ];
  return results.filter((result) => {
    const host = new URL(result.url).hostname.replace(/^www\./, '');
    return (
      (inputHost
        ? host === inputHost || host.endsWith(`.${inputHost}`)
        : host
            .split('.')
            .slice(0, -1)
            .some((segment) => tokens.includes(segment) || segment === name)) &&
      !aggregators.some((domain) => host === domain || host.endsWith(`.${domain}`)) &&
      (!['github.com', 'composio.dev'].includes(host) || name.includes(host.split('.')[0]))
    );
  });
}
export function providerDomain(homepage: string) {
  return new URL(homepage).hostname.replace(/^(www|support|help|docs|developer|developers)\./, '');
}
export async function searchWeb(query: string, domains: string[] = []): Promise<SearchResult[]> {
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
      ...(domains.length ? { include_domains: domains } : {}),
    }),
    signal: AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error(`Search provider unavailable (HTTP ${response.status})`);
  const data = searchSchema.parse(await response.json());
  return data.results.filter((r) => {
    try {
      validateRemoteUrl(r.url);
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      return (
        !domains.length || domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
      );
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
    const community = /^(community|forum|forums)\./i.test(domain);
    const official =
      !community &&
      (providerDomains(officialDomain).some(
        (host) => domain === host || domain.endsWith(`.${host}`),
      ) ||
        domain === 'docs.composio.dev');
    const id = `s${existing.length + sources.length + 1}`;
    sources.push({
      id,
      title: doc.title,
      url: doc.url,
      domain,
      type: official ? 'official' : 'third_party',
      accessedAt: new Date().toISOString(),
      summary: `Fetched passage (not a search snippet): ${doc.text.slice(0, 700)}`,
      authority:
        domain === 'docs.composio.dev' ? 'composio' : official ? 'provider' : 'third_party',
      topics: sourceTopics(doc.text),
      capture: 'fetched',
      content: doc.text,
      originalUrl: initial.url,
      contentHash: createHash('sha256').update(doc.text).digest('hex'),
      text: doc.text,
    });
    attempts.push(`Retrieved ${doc.url} (${doc.text.length} readable characters)`);
  });
  return { sources, attempts };
}
