import { z } from 'zod';
import { guideSchema, type Claim, type Guide, type Source } from '../validation';
import { detectAuthenticationType, documentedClaim, evidenceCoverage, nativeContext, passagesFor, toolkitMatches, unresolved, type Identity, type Topic } from './evidence';
export const factSchema = z.object({
  kind: z.enum(['registration', 'callback', 'scopes', 'prerequisites', 'testing', 'distribution', 'approval', 'troubleshooting']),
  sourceId: z.string(),
  passage: z.string().min(40).max(1200),
});
export const factOutputSchema = z.object({ facts: z.array(factSchema).max(12) });
export type Fact = z.infer<typeof factSchema>;
const topicFor = (kind: Fact['kind']): Topic => kind === 'scopes' ? 'scopes' : ['approval', 'distribution'].includes(kind) ? 'approval' : 'setup';
const kindMatches: Record<Fact['kind'], RegExp> = {
  registration: /(?:register|creat\w*).{0,70}(?:OAuth|app|integration)|(?:OAuth|app|integration).{0,70}(?:register|creat)/i,
  callback: /redirect[_ ]?(?:uri|url)|callback/i,
  scopes: /scopes?|permissions/i,
  prerequisites: /prerequisites|requirements|must have|need.{0,40}account|account.{0,40}required/i,
  testing: /test|sandbox|development mode|authoriz.{0,100}(?:base|workspace|account|resource)/i,
  distribution: /other.{0,30}users|external|distribut|publish|privacy policy|terms of service/i,
  approval: /(?:\breview\b|\bapproval\b|\bverification\b).{0,120}(?:requir|must|optional|if |when )|(?:must|requir).{0,120}(?:\breview\b|\bapproval\b|\bverification\b)/i,
  troubleshooting: /(?:error|invalid|fails?|revok).{0,180}(?:check|ensure|retry|confirm|reauthoriz)/i,
};
export function acceptFact(fact: Fact, sources: Source[], identity: Identity) {
  const source = sources.find((s) => s.id === fact.sourceId);
  if (!source || !source.content?.includes(fact.passage) || !nativeContext(source, fact.passage, identity)) return null;
  if (!kindMatches[fact.kind].test(fact.passage)) return null;
  if (!passagesFor(source, topicFor(fact.kind), identity).length) return null;
  if (/deprecated|no longer|historical|used to (?:use|support|offer)/i.test(fact.passage) && fact.kind !== 'troubleshooting') return null;
  if (fact.kind === 'registration' && !/oauth/i.test(fact.passage)) return null;
  if (fact.kind === 'registration' && !/redirect|client[_ ]id|developer console|developer portal|register an? OAuth|new OAuth app/i.test(fact.passage)) return null;
  if (['registration', 'callback', 'scopes'].includes(fact.kind) && /personal access token/i.test(fact.passage) && !/OAuth.{0,80}(?:integration|app|client|scope)|(?:integration|app|client).{0,80}OAuth/i.test(fact.passage)) return null;
  return { fact, source, claim: documentedClaim(fact.passage, source, fact.passage, topicFor(fact.kind)) };
}
const policyClaim = (text: string, basis: Claim): Claim => ({ ...basis, text, support: basis.support ? { ...basis.support, reviewedText: text } : null });
const titles: Record<Fact['kind'], string> = {
  registration: 'Register your application using the provider instructions',
  callback: 'Configure the callback and keep credentials in your provider and Composio consoles',
  scopes: 'Select permissions for the actions your agent needs',
  prerequisites: 'Check the documented prerequisites',
  testing: 'Test access with an eligible account',
  distribution: 'Complete the documented external-user requirements',
  approval: 'Check the documented review conditions',
  troubleshooting: 'Inspect the provider’s troubleshooting instructions',
};
export function buildGuide(identity: Identity, sources: Source[], proposed: Fact[], attempted: string[], now = new Date().toISOString()): Guide {
  const acceptedProposals = proposed.flatMap((fact) => { const checked = acceptFact(fact, sources, identity); return checked ? [checked] : []; });
  // Extractive recovery: a missing model-selected fact can use a directly matching official passage.
  for (const kind of ['registration', 'callback', 'scopes', 'distribution'] as const) {
    if (acceptedProposals.some((item) => item.fact.kind === kind)) continue;
    const candidate = sources.flatMap((source) => passagesFor(source, topicFor(kind), identity).map((passage) => acceptFact({ kind, sourceId: source.id, passage }, sources, identity))).find(Boolean);
    if (candidate) acceptedProposals.push(candidate);
  }
  const accepted = acceptedProposals.filter((item, index, all) => all.findIndex((candidate) => candidate.fact.kind === item.fact.kind) === index);
  const protocol = detectAuthenticationType(sources, identity);
  const oauthSource = sources.find((s) => passagesFor(s, 'oauth', identity).some((p) => /OAuth|authorization code/i.test(p)));
  const oauthPassage = oauthSource && passagesFor(oauthSource, 'oauth', identity)[0];
  const oauthSupported = protocol && ['oauth2', 'oauth1', 'oauth_like_proprietary'].includes(protocol.type) || !!oauthPassage && !/(?:does not|doesn't|do not) support OAuth/i.test(oauthPassage);
  const oauthEvidence = protocol && protocol.type !== 'api_key' ? documentedClaim(`Provider documentation describes ${protocol.type === 'unsupported' ? 'OAuth as unsupported' : protocol.type === 'oauth_like_proprietary' ? 'an OAuth-style proprietary flow' : protocol.type === 'oauth1' ? 'OAuth 1.0' : 'OAuth 2.0'}.`, protocol.source, protocol.passage, 'oauth', protocol.type === 'unsupported' ? 'unsupported' : 'supported') : oauthSource && oauthPassage ? documentedClaim('Provider documentation describes third-party OAuth access to its resources.', oauthSource, oauthPassage, 'oauth', 'supported') : unresolved('This investigation did not retrieve official evidence establishing third-party OAuth access to this provider.');
  const toolkit = sources.find((s) => toolkitMatches(s, identity));
  const capability = toolkit && /composio.managed OAuth available\??[^\n]{0,12}(?:\*\*)?\s*[:|]?\s*(Yes|No)/i.exec(toolkit.content ?? '');
  const managed = capability?.[1].toLowerCase() === 'yes' ? 'available' : capability?.[1].toLowerCase() === 'no' ? 'unavailable' : 'unknown';
  const capabilityPassage = toolkit && capability ? toolkit.content!.slice(Math.max(0, capability.index - 60), capability.index + capability[0].length + 40) : null;
  const managedEvidence = toolkit && capabilityPassage ? documentedClaim(`Composio documents managed OAuth as ${managed} for ${identity.name}. Scope fit and successful authorization are separate checks.`, toolkit, capabilityPassage, 'managed_auth', managed) : unresolved('This investigation did not retrieve provider-specific Composio evidence establishing managed OAuth availability.');
  const approvalFacts = accepted.filter(({ fact }) => fact.kind === 'approval');
  const approvalClassifications = approvalFacts.map(({ fact }) => /\bif\b|\bwhen\b|internal|external|distribut|sensitive|restricted|only/i.test(fact.passage) ? 'conditional' : /(?:no|not).{0,25}(?:review|approval).{0,25}required|(?:review|approval).{0,25}not required/i.test(fact.passage) ? 'not_required' : /\bif\b|\bwhen\b|external|distribut|sensitive|restricted/i.test(fact.passage) ? 'conditional' : 'required');
  const approval = new Set(approvalClassifications).size === 1 ? approvalClassifications[0] : 'unknown';
  const approvalEvidence = approval !== 'unknown' ? { ...approvalFacts[0].claim, support: { ...approvalFacts[0].claim.support!, conclusion: approval } } : unresolved('This investigation did not establish whether provider review is required for your intended distribution.');
  const methods: Guide['authenticationMethods'] = [];
  if (protocol && ['oauth2', 'oauth1', 'oauth_like_proprietary'].includes(protocol.type)) methods.push(protocol.type as 'oauth2' | 'oauth1' | 'oauth_like_proprietary');
  for (const s of sources.filter((s) => nativeContext(s, s.content ?? '', identity))) {
    if (/personal access tokens? (?:\(PATs?\) )?(?:allow|grant)|personal access tokens for individual use/i.test(s.content ?? '')) methods.push('personal_access_token');
    if (/(?:authenticate|authentication) (?:using|with) (?:an? )?API key/i.test(s.content ?? '') && !/API keys.{0,60}(?:deprecated|no longer)/i.test(s.content ?? '')) methods.push('api_key');
  }
  const steps: Guide['steps'] = [];
  if (managed === 'available') {
    const general = sources.find((s) => s.authority === 'composio' && /connect link/i.test(s.content ?? '') && !/\/toolkits\//.test(s.url));
    const connectIndex = general?.content?.toLowerCase().indexOf('connect link') ?? -1;
    const generalPassage = general && connectIndex >= 0 ? general.content!.slice(Math.max(0, connectIndex - 120), connectIndex + 780) : null;
    const connectionBasis = general && generalPassage ? documentedClaim(generalPassage, general, generalPassage, 'setup') : managedEvidence;
    for (const [id, title, detail, stage, basis] of [
      ['scopes', 'Confirm managed scope coverage', 'Compare the managed toolkit’s default scopes with the exact actions your agent needs. Managed availability does not establish scope fit.', 'Configure', managedEvidence],
      ['connect', 'Connect an eligible test account through Composio', 'Use Composio’s connection flow for the selected toolkit. The account owner authorizes the requested access; credentials stay with the provider and Composio.', 'Configure', connectionBasis],
      ['test', 'Test the required action and report the outcome', 'Use a deliberately selected test resource to check your required read operation. Mark this complete only after observing the result yourself; this research did not test a connection.', 'Test', connectionBasis],
    ] as const) {
      steps.push({ id: `managed-${id}`, title, detail: policyClaim(detail, basis), owner: 'Human', stage, routes: ['managed'], url: id === 'scopes' ? toolkit!.url : general?.url ?? toolkit!.url, note: 'Suggested evaluation action; external completion is user-reported.', effort: null, blocker: null });
    }
  }
  if (oauthSupported) {
    for (const [index, item] of accepted.filter(({ fact }) => fact.kind !== 'troubleshooting').slice(0, 9).entries()) {
      const stage = item.fact.kind === 'registration' || item.fact.kind === 'prerequisites' ? 'Register' : item.fact.kind === 'testing' ? 'Test' : item.fact.kind === 'distribution' || item.fact.kind === 'approval' ? 'Verify' : 'Configure';
      steps.push({ id: `custom-${item.fact.kind}-${index}`, title: titles[item.fact.kind], detail: item.claim, owner: 'Human', stage, routes: ['custom'], url: item.source.url, note: 'Follow the quoted provider instructions. Completing this checkbox reports your progress only.', effort: null, blocker: null });
    }
  }
  if (!steps.some((s) => s.routes.includes('custom'))) steps.push({ id: 'custom-evidence-check', title: 'Review the missing provider documentation', detail: unresolved('This investigation did not retrieve sufficient native OAuth registration instructions. Review the sources before registering an application.'), owner: 'Human', stage: 'Verify', routes: ['custom'], url: oauthSource?.url ?? null, note: null, effort: null, blocker: 'Provider setup documentation is unresolved.' });
  const coverage = evidenceCoverage(sources, identity);
  const unknowns = Object.entries(coverage).filter(([, covered]) => !covered).map(([topic]) => `This investigation did not retrieve relevant official evidence for ${topic.replace('_', ' ')}.`);
  if (approval === 'unknown') unknowns.push('This investigation did not establish whether app review is required for your intended distribution.');
  unknowns.push('Confirm managed default scope coverage and target-account policies for your use case.', 'No provider login, connected-account test, or approval outcome was observed.', 'Provider review timing was not established.');
  const roleEvidence = accepted.filter(({ fact }) => !['troubleshooting', 'approval'].includes(fact.kind)).map(({ claim }) => ({ owner: 'Human' as const, detail: claim }));
  return guideSchema.parse({
    slug: identity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || new URL(identity.website).hostname.replace(/\./g, '-'),
    ...identity, description: `${identity.name}: ${oauthSupported ? 'documented OAuth integration support' : 'OAuth support unresolved'}. ${managed === 'available' ? 'Composio-managed OAuth is documented; confirm scope coverage and test access.' : 'Review provider setup evidence and authentication options.'}`,
    category: 'Developer tools', aliases: [], logo: null, featured: false, version: 1,
    status: Object.values(coverage).every(Boolean) ? 'sourced' : 'partial',
    oauthStatus: protocol?.type === 'unsupported' ? 'unsupported' : oauthSupported ? 'supported' : 'unknown',
    oauthEvidence, authenticationType: protocol?.type ?? 'unverified', authenticationEvidence: protocol ? documentedClaim(`Documented mechanism: ${protocol.type}.`, protocol.source, protocol.passage, protocol.type === 'api_key' ? 'general' : 'oauth', protocol.type) : unresolved('The exact OAuth version or protocol was not established.'), authenticationMethods: [...new Set(methods)],
    managedAuth: managed, managedEvidence,
    difficulty: 'Unknown', difficultyExplanation: unresolved('Difficulty depends on the selected route, scope fit, and your existing provider account.'), setupEffort: unresolved('Hands-on effort was not measured; provider waiting is separate.'),
    approval, approvalEvidence, approvalTime: unresolved('No provider review timeline was established.'),
    mainBlocker: unresolved(managed === 'available' ? 'Confirm default scope coverage and test the intended action with an eligible account.' : 'Resolve the documented authentication route and missing setup evidence before implementation.'),
    prerequisites: ['Choose the actions and resources your agent needs.', 'Use an eligible test account. Keep provider credentials in the provider and Composio consoles.'],
    steps, approvalDetails: [...accepted.filter(({ fact }) => ['distribution', 'approval'].includes(fact.kind)).map(({ fact, claim }) => ({ title: fact.kind === 'distribution' ? 'External-user conditions' : 'Provider review conditions', detail: claim })), { title: 'Unresolved review and timing', detail: unresolved('No review exemption or approval duration is inferred from missing documentation. Confirm applicability with the provider.') }],
    troubleshooting: accepted.filter(({ fact }) => fact.kind === 'troubleshooting').map(({ claim }) => ({ symptom: 'Provider-documented troubleshooting', reason: claim, action: 'Follow the provider instructions quoted above and confirm applicability to your account.' })),
    agentResponsibilities: ['Investigate public documentation and retain source evidence.'], humanResponsibilities: ['Own account login, permissions, credentials, and observed test results.'], responsibilityEvidence: roleEvidence,
    unknowns, sources, generatedAt: now, checkedAt: now, stageExemptions: [],
    provenance: { method: 'live_research', pipelineVersion: 2, attempted,
      extraction: { proposed: proposed.length, accepted: accepted.length, rejected: proposed.filter((fact) => !acceptFact(fact, sources, identity)).map((fact) => ({ kind: fact.kind, sourceId: fact.sourceId, reason: 'No matching relevant native provider evidence for this fact; omitted from guidance.' })) },
      limitations: ['Guidance is extracted from public documentation and checked automatically for authority, topic, direction, and retained wording. It is not a human review or a successful setup/approval outcome.'] },
  });
}
