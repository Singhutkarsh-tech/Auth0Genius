import { guideSchema, type Claim, type Guide } from '../../src/lib/validation';
export const claim = (text: string): Claim => ({
  text,
  status: 'unverified',
  sourceIds: [],
  support: null,
});
// Synthetic document content, not a real research run or a cloned provider seed.
export function liveGuide(): Guide {
  return guideSchema.parse({
    slug: 'new-example',
    name: 'Example fixture',
    website: 'https://example.com',
    description: 'Synthetic guide for regression tests.',
    category: 'Testing',
    aliases: [],
    logo: null,
    featured: false,
    version: 1,
    status: 'partial',
    oauthStatus: 'unknown',
    oauthEvidence: claim('OAuth support awaits semantic review.'),
    managedAuth: 'unknown',
    managedEvidence: claim('Managed availability is unknown.'),
    difficulty: 'Unknown',
    difficultyExplanation: claim('Unknown'),
    setupEffort: claim('Unknown'),
    approval: 'unknown',
    approvalEvidence: claim('Approval is unknown.'),
    approvalTime: claim('Unknown'),
    mainBlocker: claim('Evidence needs review.'),
    prerequisites: [],
    steps: [
      {
        id: 'review-evidence',
        title: 'Review OAuth evidence',
        detail: claim('Review the retained source material.'),
        owner: 'Human',
        stage: 'Verify',
        routes: ['custom'],
        url: 'https://example.com/oauth',
        note: null,
        effort: null,
        blocker: null,
      },
    ],
    approvalDetails: [
      { title: 'Approval interpretation', detail: claim('No exemption has been established.') },
    ],
    troubleshooting: [],
    agentResponsibilities: [],
    humanResponsibilities: ['Review evidence'],
    unknowns: ['Synthetic test fixture'],
    sources: [
      {
        id: 's1',
        title: 'Synthetic provider OAuth documentation',
        url: 'https://example.com/oauth',
        domain: 'example.com',
        type: 'official',
        authority: 'provider',
        topics: ['oauth', 'scopes', 'setup', 'approval'],
        capture: 'fetched',
        content:
          'Example supports OAuth 2.0 authorization code flow. Request the read scope. Review is required if the application is distributed commercially.',
        originalUrl: 'https://example.com/oauth',
        contentHash: 'synthetic-test-hash',
        accessedAt: '2026-10-20T00:00:00.000Z',
        summary: 'Synthetic fetched text, not a search result.',
      },
      {
        id: 'c1',
        title: 'Synthetic Composio documentation',
        url: 'https://docs.composio.dev/docs/authentication',
        domain: 'docs.composio.dev',
        type: 'official',
        authority: 'composio',
        topics: ['managed_auth', 'setup'],
        capture: 'fetched',
        content:
          'Managed authentication uses Composio credentials. This generic text does not establish Example availability.',
        originalUrl: 'https://docs.composio.dev/docs/authentication',
        contentHash: 'synthetic-test-hash',
        accessedAt: '2026-10-20T00:00:00.000Z',
        summary: 'Generic authentication guidance only.',
      },
    ],
    generatedAt: '2026-10-20T00:00:00.000Z',
    checkedAt: null,
    stageExemptions: [],
    provenance: {
      method: 'live_research',
      attempted: ['Synthetic deterministic test fixture only. No real research.'],
      limitations: ['Not live research.'],
    },
  });
}
export function reviewedClaim(
  text: string,
  sourceId: string,
  topic: NonNullable<Claim['support']>['topic'],
  conclusion: string,
  passage: string,
): Claim {
  return {
    text,
    status: 'verified',
    sourceIds: [sourceId],
    support: {
      topic,
      conclusion,
      review: 'reviewed',
      reviewedText: text,
      references: [{ sourceId, passage }],
    },
  };
}
