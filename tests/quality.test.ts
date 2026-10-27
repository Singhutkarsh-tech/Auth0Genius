import { describe, expect, it } from 'vitest';
import { liveGuide } from './helpers/live-guide';
import { compactEvidence, detectAuthenticationType, evidenceCoverage, rankDocuments } from '@/lib/research/evidence';
import { acceptFact, buildGuide } from '@/lib/research/guide-builder';
import { downgradeUnreviewed, type Source } from '@/lib/validation';
import { applicableSteps } from '@/lib/workspace';
const identity = { name: 'Orbit', website: 'https://orbit.dev' };
const source = (id: string, url: string, content: string, title = 'Orbit API authentication'): Source => ({ ...liveGuide().sources[0], id, url, title, domain: new URL(url).hostname, authority: url.includes('composio.dev') ? 'composio' : 'provider', content, topics: ['general', 'oauth', 'setup', 'scopes', 'approval', 'managed_auth'] });
const auth = source('auth', 'https://orbit.dev/docs/oauth', 'Orbit supports OAuth 2.0 authorization code flow so third-party applications can access Orbit workspaces with user consent. Personal access tokens allow individual API access.');
const registration = source('setup', 'https://orbit.dev/docs/oauth/register', 'Register an OAuth application in the Orbit developer console. Enter your redirect URL and select the records:read scope. Keep the client secret on your server.');
const toolkit = source('toolkit', 'https://docs.composio.dev/toolkits/orbit.md', '# Orbit\n- **Auth:** OAUTH2, API_KEY\n- **Composio-managed OAuth available?** Yes\n- **Slug:** ORBIT', 'Orbit');
describe('Provider-specific extractive guidance', () => {
  it('ranks official developer docs above forums, SSO and outbound integrations', () => {
    const docs = ['https://community.orbit.dev/oauth', 'https://orbit.dev/help/sso', 'https://orbit.dev/docs/oauth'].map((url, i) => ({ url, title: ['Orbit OAuth forum', 'Configure SSO', 'Orbit OAuth developer reference'][i], content: '' }));
    expect(rankDocuments(docs, 'oauth', identity).map((r) => r.url)).toEqual(['https://orbit.dev/docs/oauth']);
  });
  it('rejects official outbound Google OAuth, SSO, negated and illustrative protocol mentions', () => {
    for (const [title, content] of [
      ['Connect Google Drive', 'Orbit connects to Google Drive using Google OAuth 2.0 authorization to access your files.'],
      ['Configure SSO', 'Orbit supports SSO. Configure the OAuth 2.0 identity provider for staff login.'],
      ['Orbit examples', 'This historical example uses Google OAuth 2.0. It does not describe Orbit third-party access.'],
      ['Orbit documentation', 'OAuth 2.0'],
    ]) expect(detectAuthenticationType([source('bad', 'https://orbit.dev/docs/auth', content, title)], identity)).toBeNull();
  });
  it('retains a full native protocol context and permits multiple auth methods', () => {
    const result = detectAuthenticationType([auth], identity);
    expect(result?.type).toBe('oauth2');
    expect(result?.passage).toContain('third-party applications can access Orbit');
    expect(result?.passage.length).toBeGreaterThan(50);
    expect(buildGuide(identity, [auth, toolkit], [], []).authenticationMethods).toEqual(['oauth2', 'personal_access_token']);
  });
  it('resolves provider-specific managed availability while generic Composio docs cannot', () => {
    const g = buildGuide(identity, [auth, toolkit, registration], [{ kind: 'registration', sourceId: 'setup', passage: registration.content! }], []);
    expect(g.oauthStatus).toBe('supported');
    expect(g.managedAuth).toBe('available');
    expect(g.managedEvidence.support?.review).toBe('rule_checked');
    expect(g.approval).toBe('unknown');
    expect(applicableSteps(g, 'managed')).toHaveLength(3);
    expect(applicableSteps(g, 'custom')[0].detail.text).toContain('Register an OAuth application');
    const generic = source('general', 'https://docs.composio.dev/docs/authentication', 'Composio has managed OAuth for supported toolkits.');
    expect(buildGuide(identity, [auth, generic], [], []).managedAuth).toBe('unknown');
    expect(evidenceCoverage([auth, toolkit, registration], identity)).toMatchObject({ oauth: true, setup: true, scopes: true, approval: false, managed_auth: true });
  });
  it('preserves legitimate conditional review requirements without fabricating a duration', () => {
    const review = source('review', 'https://orbit.dev/docs/oauth/review', 'Orbit requires application review if your OAuth application is distributed to external users. Submit your intended scopes and privacy policy.');
    const g = buildGuide(identity, [auth, review], [{ kind: 'approval', sourceId: 'review', passage: review.content! }], []);
    expect(g.approval).toBe('conditional');
    expect(g.approvalTime.status).toBe('unverified');
  });
  it('rejects invented passages and historical community advice before tasks or responsibilities exist', () => {
    const forum = { ...source('forum', 'https://community.orbit.dev/oauth', 'Orbit OAuth is broken; generate deprecated API keys instead. This old bug has no confirmed resolution.'), authority: 'third_party' as const };
    expect(acceptFact({ kind: 'registration', sourceId: 'setup', passage: 'Generate a deprecated API key; OAuth is unreliable.' }, [registration], identity)).toBeNull();
    const g = buildGuide(identity, [auth, forum], [{ kind: 'troubleshooting', sourceId: 'forum', passage: forum.content! }], []);
    expect(JSON.stringify({ steps: g.steps, blockers: g.mainBlocker, roles: g.humanResponsibilities, roleEvidence: g.responsibilityEvidence, troubleshooting: g.troubleshooting, unknowns: g.unknowns })).not.toMatch(/broken|deprecated API keys|unreliable/);
    expect(g.troubleshooting).toEqual([]);
  });
  it('removes legacy unsupported blockers, instructions, roles, and negative unknowns', () => {
    const g = liveGuide();
    g.mainBlocker.text = 'OAuth is broken and unreliable';
    g.humanResponsibilities = ['Generate deprecated API keys'];
    g.unknowns = ['No official registration portal exists'];
    g.troubleshooting = [{ symptom: 'Broken OAuth', reason: g.mainBlocker, action: 'Use API keys' }];
    expect(JSON.stringify(downgradeUnreviewed(g))).not.toMatch(/broken and unreliable|Generate deprecated|No official registration portal exists|Broken OAuth/);
  });
  it('sends compact passages once, with stable IDs and bounded total characters', () => {
    const payload = compactEvidence([auth, registration, toolkit], identity);
    expect(payload.map((s) => s.id)).toEqual(['auth', 'setup', 'toolkit']);
    expect(payload[0]).not.toHaveProperty('text');
    expect(payload[0]).not.toHaveProperty('content');
    expect(JSON.stringify(payload).length).toBeLessThan(21000);
  });
});
