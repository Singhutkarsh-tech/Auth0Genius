import { describe, it, expect } from 'vitest';
import { validateEvidence, downgradeUnreviewed } from '@/lib/validation';
import { detectAuthenticationType, reconcileGuide, resolveIdentityOrigin } from '@/lib/research/synthesis';
import { liveGuide, reviewedClaim } from './helpers/live-guide';
describe('Classification consistency and relevant semantic support', () => {
  it('accepts only observed identity origins while treating www as the same host', () => {
    const result = [
      {
        title: 'Airtable',
        url: 'https://www.airtable.com/developers/web/api',
        content: 'Discovery only',
      },
    ];
    expect(resolveIdentityOrigin('https://airtable.com', result)).toBe('https://www.airtable.com');
    expect(() => resolveIdentityOrigin('https://airtable.com.attacker.example', result)).toThrow(
      'not supported',
    );
  });
  it('rejects supported OAuth paired with an explicitly unverified claim', () => {
    const g = liveGuide();
    g.oauthStatus = 'supported';
    expect(() => validateEvidence(g)).toThrow('Inconsistent oauth');
  });
  it('rejects a provider approval exemption citing generic Composio documentation', () => {
    const g = liveGuide();
    g.approval = 'not_required';
    g.approvalEvidence = reviewedClaim(
      'Provider review is never required.',
      'c1',
      'approval',
      'not_required',
      g.sources[1].content!,
    );
    g.sources[1].topics.push('approval');
    expect(() => validateEvidence(g)).toThrow('provider evidence');
  });
  it('rejects available managed auth backed only by provider material', () => {
    const g = liveGuide();
    g.managedAuth = 'available';
    g.sources[0].topics.push('managed_auth');
    g.managedEvidence = reviewedClaim(
      'Managed auth is available.',
      's1',
      'managed_auth',
      'available',
      g.sources[0].content!,
    );
    expect(() => validateEvidence(g)).toThrow('Composio evidence');
  });
  it('rejects irrelevant official homepage citations even with a provider source elsewhere', () => {
    const g = liveGuide();
    g.sources[0].topics = ['general'];
    g.oauthStatus = 'supported';
    g.oauthEvidence = reviewedClaim(
      'OAuth is supported.',
      's1',
      'oauth',
      'supported',
      g.sources[0].content!,
    );
    expect(() => validateEvidence(g)).toThrow('Irrelevant source topic');
  });
  it('rejects a passage that was not fetched', () => {
    const g = liveGuide();
    g.oauthEvidence = reviewedClaim(
      'OAuth is supported.',
      's1',
      'oauth',
      'supported',
      'A stale search snippet',
    );
    g.oauthStatus = 'supported';
    expect(() => validateEvidence(g)).toThrow('not retained');
  });
  it('requires explicit review rather than citation presence', () => {
    const g = liveGuide();
    g.oauthEvidence = { ...g.oauthEvidence, status: 'verified', sourceIds: ['s1'] };
    expect(() => validateEvidence(g)).toThrow('explicit semantic review');
  });
  it('binds review to the exact claim and classification', () => {
    const g = liveGuide();
    g.oauthStatus = 'supported';
    g.oauthEvidence = reviewedClaim(
      'OAuth is supported.',
      's1',
      'oauth',
      'unsupported',
      g.sources[0].content!,
    );
    expect(() => validateEvidence(g)).toThrow('Inconsistent oauth');
    g.oauthEvidence.support!.conclusion = 'supported';
    g.oauthEvidence.text = 'OAuth support is unverified.';
    expect(() => validateEvidence(g)).toThrow('exact claim');
  });
  it('accepts legitimate reviewed conditional approval without turning it into an exemption', () => {
    const g = liveGuide();
    g.approval = 'conditional';
    g.approvalEvidence = reviewedClaim(
      'Review is required for commercial distribution.',
      's1',
      'approval',
      'conditional',
      'Review is required if the application is distributed commercially.',
    );
    expect(validateEvidence(g).approval).toBe('conditional');
  });
  it('derives protocol support from fetched official OAuth 2.0 text, not the model claim', () => {
    const g = liveGuide();
    g.oauthEvidence = reviewedClaim(
      'OAuth is supported.',
      's1',
      'oauth',
      'supported',
      g.sources[0].content!,
    );
    g.oauthStatus = 'supported';
    const output = reconcileGuide(
      g,
      g.sources.map((s) => ({ ...s, text: s.content! })),
    );
    expect(output.oauthStatus).toBe('supported');
    expect(output.description).toContain('Partial provider research');
    expect(output.oauthEvidence.status).toBe('verified');
    expect(output.oauthEvidence.support?.review).toBe('rule_checked');
    expect(output.authenticationType).toBe('oauth2');
    expect(output.sources[0].content).toContain('OAuth 2.0');
    expect(output.steps).toHaveLength(1);
  });
  it('does not classify OAuth 2.0 without an explicitly supported provider claim', () => {
    const g = liveGuide();
    g.authenticationType = 'oauth2';
    expect(() => validateEvidence(g)).toThrow('Authentication mechanism requires relevant verified provider evidence');
  });
  it('classifies Figma from fetched OAuth 2 provider text rather than model output', () => {
    const source = liveGuide().sources[0];
    source.url = 'https://developers.figma.com/docs/rest-api/authentication/';
    source.domain = 'developers.figma.com';
    source.content = 'The recommended way is to create an OAuth 2 app. OAuth 2.0 uses authorization code.';
    source.capture = 'fetched';
    source.topics = ['oauth', 'general'];
    expect(detectAuthenticationType([{ ...source, text: source.content }])).toMatchObject({
      type: 'oauth2',
      passage: 'OAuth 2',
      source: { authority: 'provider', capture: 'fetched' },
    });
  });
  it('does not call Zerodha Kite Connect standard OAuth 2 from its OAuth-style flow', () => {
    const source = liveGuide().sources[0];
    source.url = 'https://kite.trade/docs/connect/v3/user/';
    source.domain = 'kite.trade';
    source.content = 'Kite Connect uses an OAuth-style login flow with request_token and checksum.';
    source.capture = 'fetched';
    source.topics = ['oauth', 'general'];
    expect(detectAuthenticationType([{ ...source, text: source.content }])).toMatchObject({
      type: 'oauth_like_proprietary',
    });
  });
  it.each([
    ['OAuth 1.0', 'oauth1'],
    ['Authentication using an API key', 'api_key'],
    ['This API does not support OAuth', 'unsupported'],
  ] as const)('keeps protocol classification distinct for %s', (text, expected) => {
    const source = liveGuide().sources[0];
    source.url = 'https://provider.example/docs/auth';
    source.domain = 'provider.example';
    source.content = text;
    source.capture = 'fetched';
    source.topics = ['oauth', 'general'];
    expect(detectAuthenticationType([{ ...source, text: source.content }])?.type).toBe(expected);
  });
  it('safely reads legacy records without retaining unsupported positive badges', () => {
    const g = liveGuide();
    g.oauthStatus = 'supported';
    g.oauthEvidence.status = 'verified';
    g.oauthEvidence.sourceIds = ['s1'];
    expect(downgradeUnreviewed(g).oauthStatus).toBe('unknown');
  });
});

it('uses an API-compatible output schema while retaining server URL validation', async () => {
  const { guideOutputFormat } = await import('@/lib/research/synthesis');
  expect(JSON.stringify(guideOutputFormat().schema)).not.toContain('"format":"uri"');
  const g = liveGuide();
  g.website = 'not a URL';
  expect(() => validateEvidence(g)).toThrow();
});

it('replaces a mismatched model excerpt with an exact fetched protocol passage', () => {
  const g = liveGuide();
  g.oauthEvidence = reviewedClaim(
    'OAuth supported',
    's1',
    'oauth',
    'supported',
    'Invented excerpt',
  );
  const output = reconcileGuide(
    g,
    g.sources.map((s) => ({ ...s, text: s.content! })),
  );
  expect(output.oauthEvidence.support?.references[0].passage).toBe('OAuth 2.0');
  expect(output.oauthStatus).toBe('supported');
  expect(output.oauthEvidence.support?.review).toBe('rule_checked');
});

it('does not present unresolved provider approval as an estimate', () => {
  const g = liveGuide();
  g.approvalEvidence.status = 'estimated';
  expect(downgradeUnreviewed(g).approvalEvidence.status).toBe('unverified');
  expect(
    reconcileGuide(
      g,
      g.sources.map((s) => ({ ...s, text: s.content! })),
    ).approvalEvidence.status,
  ).toBe('unverified');
});
