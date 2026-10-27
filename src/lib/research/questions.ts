import type { Source } from '../validation';
import { searchWeb, retrieve, providerDomains, providerReferenceResults, type SearchResult, type Retrieved } from './retrieval';
import { evidenceCoverage, detectAuthenticationType, rankDocuments, requiredTopics, type Topic, type Identity } from './evidence';
import { boundedMap, emptyMetrics, researchLimits, type ResearchMetrics } from './limits';
export type ResearchEvidenceContext = { identity?: Identity; domain?: string; sources: Retrieved[]; attempted: string[]; metrics?: ResearchMetrics; refresh?: boolean; useCase?: string; coverage?: Record<Topic, boolean> };
const prompts: Record<Topic, string> = {
  oauth: 'official developer API OAuth authentication third-party access authorization reference',
  setup: 'official register OAuth integration application developer hub redirect URL client ID',
  scopes: 'official API OAuth scopes permissions prerequisites',
  approval: 'official OAuth integration external users distribution app review requirements privacy policy',
  managed_auth: 'Composio toolkit authentication managed OAuth available',
};
const fallbackPrompts: Record<Topic, string> = {
  oauth: 'OAuth reference authorization third-party integrations API access',
  setup: 'registering OAuth integrations developer app registration redirect URL',
  scopes: 'developers API OAuth scopes permissions',
  approval: 'OAuth app external users review required conditions distribution',
  managed_auth: 'toolkits managed OAuth authentication details',
};
function merge(context: ResearchEvidenceContext, sources: Source[]) {
  for (const source of sources) if (!context.sources.some((s) => s.url === source.url) && context.sources.length < researchLimits.sources) context.sources.push(source);
}
export async function researchQuestions(context: ResearchEvidenceContext, topics: Topic[], fallback = false, deadline = Date.now() + researchLimits.stageDeadlineMs) {
  if (Date.now() >= deadline) return;
  if (!context.identity) throw new Error('Provider identity confirmation is required');
  const identity = { ...context.identity, useCase: context.useCase };
  const metrics = context.metrics ??= emptyMetrics();
  const tasks = await boundedMap(topics, async (topic) => {
    const domains = topic === 'managed_auth' ? ['docs.composio.dev'] : providerDomains(identity.website);
    const query = `${identity.name} ${fallback ? fallbackPrompts[topic] : prompts[topic]}${fallback ? ` site:${topic === 'managed_auth' ? 'docs.composio.dev/toolkits' : context.domain}` : ''}`;
    const found = await searchWeb(query, domains, metrics);
    context.attempted.push(`${fallback ? 'Focused fallback' : 'Searched'} for ${topic}: ${query}`);
    const references = topic === 'oauth' ? providerReferenceResults(identity.website, 'authentication') : topic === 'setup' ? providerReferenceResults(identity.website, 'setup') : [];
    const followed = context.sources.flatMap((source) => (source.links ?? []).map((url) => ({ title: url, url, content: '' })));
    const toolkitSlug = new URL(identity.website).hostname.replace(/^(www|docs|developers)\./, '').split('.')[0];
    const toolkit = topic === 'managed_auth' ? [{ title: identity.name, url: `https://docs.composio.dev/toolkits/${toolkitSlug}.md`, content: '' }] : [];
    const ranked = rankDocuments([...references, ...toolkit, ...found, ...followed], topic, identity).filter((result, index, all) => all.findIndex((r) => r.url === result.url) === index && !context.sources.some((s) => s.url === result.url));
    return ranked.slice(0, topic === 'oauth' ? 2 : 1);
  });
  const results: SearchResult[] = [];
  let firstError: unknown;
  for (const task of tasks) {
    if (task.status === 'fulfilled') results.push(...task.value);
    else { firstError ??= task.reason; context.attempted.push('A topic search failed; retained sources and remaining topics are preserved.'); }
  }
  if (topics.includes('managed_auth') && !context.sources.some((s) => s.url === 'https://docs.composio.dev/docs/authentication')) results.push({ title: 'Composio connection lifecycle', url: 'https://docs.composio.dev/docs/authentication', content: '' });
  if (firstError && tasks.every((task) => task.status === 'rejected')) throw firstError;
  const captured = await retrieve(results, context.domain!, context.sources, { metrics, fresh: context.refresh, deadline });
  merge(context, captured.sources);
  context.attempted.push(...captured.attempts);
  context.coverage = evidenceCoverage(context.sources, identity);
}
export async function recoverEvidenceGaps(context: ResearchEvidenceContext, deadline = Date.now() + researchLimits.stageDeadlineMs) {
  if (!context.identity) throw new Error('Provider confirmation is required');
  context.coverage = evidenceCoverage(context.sources, context.identity);
  const missing = requiredTopics.filter((topic) => !context.coverage![topic]);
  if (!detectAuthenticationType(context.sources, context.identity) && !missing.includes('oauth')) missing.unshift('oauth');
  for (const topic of missing.slice(0, 3)) {
    if (Date.now() >= deadline || (context.metrics?.searches ?? 0) >= researchLimits.searches || context.sources.length >= researchLimits.sources) break;
    context.attempted.push(`Coverage gap: ${topic}. Attempting bounded targeted recovery.`);
    await researchQuestions(context, [topic], true, deadline);
    // The fallback may itself discover an overview linking to the missing reference.
    // Follow only observed, relevant official URLs, without another paid search.
    if (Date.now() < deadline && context.sources.length < researchLimits.sources &&
      (!context.coverage?.[topic] || topic === 'oauth' && !detectAuthenticationType(context.sources, context.identity))) {
      const linked = rankDocuments(context.sources.flatMap((source) => (source.links ?? []).map((url) => ({ url, title: url, content: '' }))), topic, context.identity).filter((result) => !context.sources.some((source) => source.url === result.url)).slice(0, 2);
      const followed = await retrieve(linked, context.domain!, context.sources, { metrics: context.metrics, fresh: context.refresh, deadline });
      merge(context, followed.sources);
      if (linked.length) context.attempted.push(`Followed observed official documentation links for ${topic}`, ...followed.attempts);
      context.coverage = evidenceCoverage(context.sources, context.identity);
    }
  }
  context.coverage = evidenceCoverage(context.sources, context.identity);
  const unresolved = requiredTopics.filter((topic) => !context.coverage![topic]);
  context.attempted.push(`Evidence coverage gate: ${unresolved.length ? `unresolved ${unresolved.join(', ')}; publish a limited result with these retrieval gaps` : 'all required topics have relevant official evidence; claim interpretation still checked separately'}.`);
  if (!context.sources.some((source) => source.authority === 'provider' && source.capture === 'fetched')) throw new Error('No official provider documentation was retrieved; OAuth guidance cannot be published.');
}
