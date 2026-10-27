import { identityCandidates, providerDomain, retrieve, type Retrieved, type SearchResult } from './retrieval';
import { sameOfficialDomain, normalizeProviderDomain } from './identity';
import { boundedMap, type ResearchMetrics } from './limits';

export type IdentityCandidate = {
  name: string; website: string; description: string; evidenceUrl: string; evidenceSummary: string;
};
export function candidateFromPage(source: Retrieved, query?: string): IdentityCandidate {
  const title = source.title.split(/\s[|–—]\s|\s-\s|:\s/)[0].replace(/^(Home|Welcome to)\s*[:|-]?\s*/i, '').trim();
  const brand = normalizeProviderDomain(new URL(source.url).hostname).split('.')[0];
  const brandedName = (source.content ?? source.title).match(new RegExp(`\\b${brand.replace(/[^a-z0-9]/gi, '')}\\b`, 'i'))?.[0];
  const name = query && query.toLowerCase().replace(/[^a-z0-9]/g, '') === brand ? query : brandedName ?? title;
  return {
    name: (name || new URL(source.url).hostname).slice(0, 100),
    website: `https://${normalizeProviderDomain(new URL(source.url).hostname)}`,
    description: (source.content ?? source.summary).slice(0, 280),
    evidenceUrl: source.url,
    evidenceSummary: (source.content ?? source.summary).slice(0, 500),
  };
}

// Discovery describes candidates. It never confirms a name-based provider intent.
export async function identifyProvider(query: string, results: SearchResult[], _useCase?: string, explicitUrl?: string, metrics?: ResearchMetrics) {
  const observed = identityCandidates(results, explicitUrl ?? query).slice(0, 4).map((result) => explicitUrl ? result : { ...result, url: new URL(result.url).origin });
  const outcomes = await boundedMap(observed, async (result) => {
    const response = await retrieve([result], providerDomain(result.url), [], { metrics });
    return response;
  });
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const captures = outcomes.flatMap((r) => r.status === 'fulfilled' ? r.value.sources : []).filter((source) => explicitUrl || tokens.some((token) => `${source.title} ${source.content ?? ''}`.toLowerCase().includes(token)));
  const candidates = captures.map((source) => candidateFromPage(source, explicitUrl ? undefined : query)).filter((item, i, all) => all.findIndex((other) => other.website === item.website) === i);
  const supplied = explicitUrl && captures[0];
  if (supplied && sameOfficialDomain(supplied.url, explicitUrl)) {
    return { name: candidateFromPage(supplied).name, website: `https://${normalizeProviderDomain(new URL(explicitUrl).hostname)}`, ambiguous: false, candidates, results: observed, captures };
  }
  return {
    ambiguous: true,
    reason: explicitUrl ? captures.length ? 'The website redirected to another provider domain. Confirm the intended destination.' : 'The supplied website could not establish an identity. Confirm or enter the intended website.' : candidates.length ? 'Select the provider you intend to research. OAuth research starts after your selection.' : 'This investigation could not establish a provider candidate. Enter the intended website.',
    candidates, results: observed, captures,
  };
}
export function resolveIdentityOrigin(value: string, results: SearchResult[]) {
  const requested = new URL(value);
  if (requested.protocol !== 'https:' || requested.username || requested.password || (requested.port && requested.port !== '443')) throw new Error('Provider identity URL is unsafe');
  const candidate = results.find((result) => sameOfficialDomain(result.url, value));
  if (!candidate) throw new Error('Provider identity was not supported by search results');
  return new URL(candidate.url).origin;
}
