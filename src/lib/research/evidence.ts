import type { Claim, Guide, Source } from '../validation';
import { providerDomains } from './retrieval';
import { researchLimits } from './limits';
export type Identity = { name: string; website: string; useCase?: string };
export const requiredTopics = ['oauth', 'setup', 'scopes', 'approval', 'managed_auth'] as const;
export type Topic = typeof requiredTopics[number];
const terms: Record<Topic, RegExp> = {
  oauth: /oauth(?:\s*2(?:\.0)?|\s*1(?:\.0)?|[- ]style)?|authorization code|third.party integrations/ig,
  setup: /register.{0,45}(?:app|integration)|creat.{0,35}(?:OAuth|app)|client[_ ]id|redirect (?:url|uri)|developer (?:console|portal|account)/ig,
  scopes: /scopes?|permissions|prerequisites|requirements/ig,
  approval: /\breview\b|approval|external|other.{0,30}users|distribution|publish|privacy policy|terms of service/ig,
  managed_auth: /composio.managed|managed OAuth|managed auth|connect link|auth config|session.authorize|composio_managed_auth_schemes/ig,
};
export const communityUrl = (url: string) => /(?:^|\/\/)(?:community|forum|forums)\.|\/(?:community|forum|discussions)\//i.test(url);
const irrelevant = /\bsso\b|single.sign.on|saml|outlook.calendar.sync|sync.integration|connecting.google.api/i;
export function isProviderSource(source: Source, identity: Identity) {
  const host = new URL(source.url).hostname.replace(/^www\./, '');
  return source.authority === 'provider' && source.capture === 'fetched' && !communityUrl(source.url) && providerDomains(identity.website).some((domain) => host === domain || host.endsWith(`.${domain}`));
}
export function nativeContext(source: Source, passage: string, identity: Identity) {
  if (!isProviderSource(source, identity)) return false;
  const label = `${source.title} ${new URL(source.url).pathname}`;
  if (irrelevant.test(label) || (/\/mcp\/|\bMCP\b/i.test(label) && !/mcp/i.test(identity.useCase ?? ''))) return false;
  const own = identity.name.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const foreign = /(?:Google|Microsoft|Outlook|Salesforce|Slack|GitHub|Dropbox|Airtable|Figma)\s+(?:Drive\s+|Calendar\s+)?(?:OAuth|API)|(?:connect|sync|integrat)\w*\s+(?:with\s+|to\s+)?(?:Google Drive|Outlook Calendar)/ig;
  const foreignMentions = [...passage.matchAll(foreign)];
  if (foreignMentions.some((match) => !own.some((token) => match[0].toLowerCase().includes(token)))) return false;
  if (/used to (?:use|support)|no longer supports? OAuth|historical example|example (?:of|using) (?:Google|Microsoft)/i.test(passage)) return false;
  const ownMention = own.some((token) => passage.toLowerCase().includes(token)) || passage.toLowerCase().includes(new URL(identity.website).hostname.split('.')[0]);
  return ownMention || /your (?:app|application|integration)|our API|third.party.{0,70}(?:access|authoriz)|authorization code flow|register.{0,40}(?:OAuth|application)|registered redirect|request_token.{0,100}(?:checksum|access_token)/i.test(passage);
}
export function passagesFor(source: Source, topic: Topic, identity: Identity): string[] {
  const content = source.content ?? '';
  if (topic === 'managed_auth') {
    if (source.authority !== 'composio' || source.capture !== 'fetched') return [];
  } else if (!isProviderSource(source, identity) || irrelevant.test(`${source.title} ${source.url}`)) return [];
  const pattern = new RegExp(terms[topic].source, 'ig');
  const ranges: { start: number; end: number }[] = [];
  for (const match of content.matchAll(pattern)) {
    const at = match.index!;
    const start = Math.max(0, at - 140);
    const end = Math.min(content.length, at + 760);
    if (ranges.some((range) => at >= range.start && at + match[0].length < range.end)) continue;
    ranges.push({ start, end });
    if (ranges.length === 12) break;
  }
  return ranges.map(({ start, end }) => content.slice(start, end)).sort((a, b) => (topic === 'oauth' ? Number(/OAuth\s*2|authorization code/i.test(b)) - Number(/OAuth\s*2|authorization code/i.test(a)) : 0)).filter((passage) => {
    if (topic === 'managed_auth') return true;
    if (!nativeContext(source, passage, identity)) return false;
    if (topic === 'oauth') return /oauth|authorization code/i.test(passage) && /third.party|on behalf|your app|your integration|our API|authorization code|client[_ ]id|grant.{0,60}access|(?:access|authoriz).{0,70}(?:API|data|resource|workspace|base)|OAuth[- ]style.{0,100}(?:login|request_token)/i.test(passage);
    if (topic === 'setup') return /oauth|authorization|client[_ ]id|redirect|developer/i.test(passage);
    if (topic === 'approval') return /oauth|third.party|integration|application|your app/i.test(passage);
    return /oauth|api|scope|your app/i.test(passage);
  });
}
export function toolkitMatches(source: Source, identity: Identity) {
  if (source.authority !== 'composio' || source.capture !== 'fetched') return false;
  const path = new URL(source.url).pathname;
  const match = /^\/toolkits\/([a-z0-9_-]+)(?:\.md)?\/?$/i.exec(path);
  if (!match || match[1] === 'managed-auth') return false;
  const brand = new URL(identity.website).hostname.replace(/^(www|developers|docs)\./, '').split('.')[0].replace(/[^a-z0-9]/g, '');
  const name = identity.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = match[1].replace(/[_-]/g, '');
  const content = source.content ?? '';
  // Exact toolkit heading + selected brand/domain. General auth pages cannot establish availability.
  return (slug === brand || slug === name) && (new RegExp(`(?:^|#|\\n)\\s*${match[1]}\\b`, 'i').test(content) || source.title.toLowerCase().trim() === identity.name.toLowerCase().trim());
}
export function evidenceCoverage(sources: Source[], identity: Identity) {
  return Object.fromEntries(requiredTopics.map((topic) => [topic, sources.some((source) => topic === 'managed_auth' ? toolkitMatches(source, identity) && /managed.{0,50}(?:available|yes|no)|composio_managed_auth_schemes/i.test(source.content ?? '') : passagesFor(source, topic, identity).length > 0)])) as Record<Topic, boolean>;
}
export function compactEvidence(sources: Source[], identity: Identity) {
  let remaining = researchLimits.evidenceCharacters as number;
  return sources.flatMap((source) => {
    const passages = [...new Set(requiredTopics.flatMap((topic) => passagesFor(source, topic, identity).slice(0, topic === 'oauth' ? 2 : 1)))];
    const selected: string[] = [];
    for (const passage of passages) {
      if (remaining < 200) break;
      const text = passage.slice(0, Math.min(1000, remaining));
      selected.push(text); remaining -= text.length;
      if (selected.length >= 5) break;
    }
    return selected.length ? [{ id: source.id, title: source.title, url: source.url, authority: source.authority, fetchedAt: source.accessedAt, updatedAt: source.publishedAt ?? null, passages: selected }] : [];
  });
}
export function documentedClaim(text: string, source: Source, passage: string, topic: NonNullable<Claim['support']>['topic'], conclusion = 'documented'): Claim {
  return { text, status: 'verified', sourceIds: [source.id], support: { topic, conclusion, review: 'rule_checked', reviewedText: text, references: [{ sourceId: source.id, passage }] } };
}
export const unresolved = (text: string): Claim => ({ text, status: 'unverified', sourceIds: [], support: null });
export function detectAuthenticationType(sources: Source[], identity?: Identity) {
  const identityFor = (source: Source) => identity ?? { name: new URL(source.url).hostname.split('.').slice(-2)[0], website: `https://${new URL(source.url).hostname}` };
  const found: { source: Source; passage: string; type: Guide['authenticationType'] }[] = [];
  for (const source of sources) {
    for (const passage of passagesFor(source, 'oauth', identityFor(source))) {
      let type: Guide['authenticationType'] | undefined;
      if (/(?:does not|doesn't|do not) support OAuth|OAuth (?:is )?not supported/i.test(passage)) type = 'unsupported';
      else if (/OAuth[- ]style|OAuth-like/i.test(passage)) type = 'oauth_like_proprietary';
      else if (/OAuth\s*2(?:\.0)?\b|OAuth2\b/i.test(passage)) type = 'oauth2';
      else if (/OAuth\s*1(?:\.0)?\b/i.test(passage)) type = 'oauth1';
      if (type && passage.length >= 50) found.push({ source, passage, type });
    }
  }
  if (found.some((f) => f.type === 'unsupported') && found.some((f) => f.type !== 'unsupported')) return null;
  if (!found.length) {
    for (const source of sources) {
      const content = source.content ?? '';
      const match = /(?:authenticate|authentication|authorization)\s+(?:using|with)\s+(?:an?\s+)?API key/i.exec(content);
      if (match && !/deprecated|no longer/i.test(content) && nativeContext(source, content, identityFor(source))) return { source, passage: content.slice(Math.max(0, match.index - 80), match.index + 600), type: 'api_key' as const };
    }
  }
  return found.find((f) => f.type !== 'unsupported') ?? found[0] ?? null;
}
export function rankDocuments<T extends { url: string; title: string; content: string }>(results: T[], topic: Topic, identity: Identity) {
  const score = (r: T) => {
    const host = new URL(r.url).hostname;
    const official = topic === 'managed_auth' ? host === 'docs.composio.dev' : providerDomains(identity.website).some((d) => host === d || host.endsWith(`.${d}`));
    if (!official || communityUrl(r.url)) return -100;
    const label = `${r.title} ${r.url}`;
    const toolkitPath = /^\/toolkits\/([^/]+)$/.exec(new URL(r.url).pathname);
    const mcpWeight = /\/mcp\/|\bMCP\b/i.test(label) && !/mcp/i.test(identity.useCase ?? '') ? -100 : 0;
    const toolkitWeight = topic === 'managed_auth' ? toolkitPath && toolkitPath[1] !== 'managed-auth' ? 60 : -80 : 0;
    const date = /\b(20\d\d)-\d\d-\d\d\b/.exec(r.content)?.[0];
    const freshness = date ? Math.max(-10, 3 - Math.floor((Date.now() - Date.parse(date)) / (365 * 86400000))) : 0;
    return (official ? 30 : -30) + mcpWeight + toolkitWeight + freshness + (/developer|\/api\/|\/docs\/|oauth|builder.hub/i.test(label) ? 20 : 0) + (new RegExp(terms[topic].source, 'i').test(label) ? 12 : 0) - (communityUrl(r.url) ? 80 : 0) - (irrelevant.test(label) ? 90 : 0) - (/\/blog\/|\/z-connect\/|marketing|solutions|trust.and.security/i.test(label) ? 20 : 0);
  };
  return results.map((r) => ({ r, score: score(r) })).sort((a, b) => b.score - a.score).filter((r) => r.score > 0).map(({ r }) => r);
}
