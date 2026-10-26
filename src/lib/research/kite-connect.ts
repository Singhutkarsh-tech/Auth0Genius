import type { Guide, Claim, Source } from '../validation';
import type { Retrieved } from './retrieval';

const reviewedStep = (
  text: string,
  source: Retrieved,
  topic: NonNullable<Claim['support']>['topic'],
  passage: string,
): Claim => ({
  text,
  status: 'verified',
  sourceIds: [source.id],
  support: {
    topic,
    conclusion: 'documented',
    review: 'reviewed',
    reviewedText: text,
    references: [{ sourceId: source.id, passage }],
  },
});

const unresolved = (text: string, sourceIds: string[] = []): Claim => ({
  text,
  status: 'unverified',
  sourceIds,
  support: null,
});

function passage(source: Source, pattern: RegExp, max = 1800) {
  const content = source.content ?? '';
  const match = pattern.exec(content);
  if (!match || match.index === undefined) return null;
  const start = Math.max(0, match.index - 160);
  return content.slice(start, Math.min(content.length, start + max));
}

/** Replace generic OAuth boilerplate only when both official Kite docs were fetched. */
export function applyKiteConnectGuide(guide: Guide, sources: Retrieved[]): Guide {
  let host: string;
  try {
    host = new URL(guide.website).hostname.replace(/^www\./, '');
  } catch {
    return guide;
  }
  if (host !== 'zerodha.com' && !host.endsWith('.zerodha.com') && host !== 'kite.trade')
    return guide;

  const providerDoc = (path: '/user/' | '/docs/connect/v3/') =>
    sources.find((source) => {
      try {
        const url = new URL(source.url);
        return (
          url.hostname === 'kite.trade' &&
          (path === '/user/'
            ? url.pathname.endsWith('/user/')
            : url.pathname === path || url.pathname === `${path}index.html`) &&
          source.authority === 'provider' &&
          source.capture === 'fetched'
        );
      } catch {
        return false;
      }
    });
  const login = providerDoc('/user/');
  const overview = providerDoc('/docs/connect/v3/');
  if (!login || !overview || !login.content || !overview.content) return guide;

  const registrationText = passage(
    overview,
    /Developer Account Setup|Create Developer Account/i,
    1300,
  );
  const loginText = passage(login, /A successful login comes back with a\s+request_token/i, 1300);
  const exchangeText = passage(login, /checksum\s+\(SHA-256 of api_key \+ request_token \+ api_secret\)/i, 1300);
  const headerText = passage(login, /Authorization:\s*token\s+api_key:access_token/i, 900);
  const eligibilityText = passage(overview, /Trading Account Requirements/i, 650);
  if (!registrationText || !loginText || !exchangeText || !headerText || !eligibilityText) return guide;

  const composioDocs = sources.filter((source) => source.authority === 'composio');
  const composioIds = composioDocs.map((source) => source.id);
  const tradingRules = sources.find(
    (source) =>
      source.authority === 'provider' &&
      /\b(?:NSE|SEBI)\b/i.test(source.content ?? '') &&
      /\b(?:algo|algorithm|automated trading)\b/i.test(source.content ?? ''),
  );
  const steps: Guide['steps'] = [
    {
      id: 'zerodha-composio-protocol-check',
      title: "Confirm Composio can support Kite Connect's login flow",
      detail: unresolved(
        'Kite Connect uses a provider-specific request_token and checksum exchange. The retrieved Composio pages explain managed and custom auth, but do not confirm this Kite Connect flow is supported. Verify compatibility before building the integration.',
        composioIds,
      ),
      owner: 'Human',
      stage: 'Register',
      routes: ['custom'],
      url: composioDocs.find((source) => source.url.includes('custom-app-vs-managed-app'))?.url ?? null,
      note: 'This is a compatibility check. No provider app or Composio auth config has been created.',
      effort: null,
      blocker: 'Composio compatibility with the Kite Connect token exchange is unknown.',
    },
    {
      id: 'zerodha-register-kite-app',
      title: 'Create a Kite Connect app and register its redirect URL',
      detail: reviewedStep(
        'Use Kite Connect developer setup to create an app and configure the redirect URL that receives the login response. The app receives an API key and API secret; keep the secret server-side.',
        overview,
        'setup',
        registrationText,
      ),
      owner: 'Human',
      stage: 'Configure',
      routes: ['custom'],
      url: overview.url,
      note: 'Confirm account eligibility and the current API plan in the provider console.',
      effort: null,
      blocker: null,
    },
    {
      id: 'zerodha-login-request-token',
      title: 'Send the user through Kite login and receive the request token',
      detail: reviewedStep(
        'Kite redirects a successful login to the app’s registered redirect URL with a short-lived request_token. This is Kite Connect’s OAuth-style protocol, not evidence of standard OAuth 2.0.',
        login,
        'setup',
        loginText,
      ),
      owner: 'Human',
      stage: 'Configure',
      routes: ['custom'],
      url: login.url,
      note: null,
      effort: null,
      blocker: null,
    },
    {
      id: 'zerodha-server-token-exchange',
      title: 'Exchange the request token on your server',
      detail: reviewedStep(
        'Post the request_token and Kite’s SHA-256 checksum of api_key + request_token + api_secret to its session token endpoint. Never expose the API secret in browser or mobile client code.',
        login,
        'setup',
        exchangeText,
      ),
      owner: 'Human',
      stage: 'Configure',
      routes: ['custom'],
      url: login.url,
      note: 'Auth0Genius never accepts provider credentials or tokens.',
      effort: null,
      blocker: null,
    },
    {
      id: 'zerodha-test-api-session',
      title: 'Test the resulting API session safely',
      detail: reviewedStep(
        'Kite documents subsequent API requests with Authorization: token api_key:access_token. Test a read-only operation first and confirm how the session expiry affects your product.',
        login,
        'setup',
        headerText,
      ),
      owner: 'Human',
      stage: 'Test',
      routes: ['custom'],
      url: login.url,
      note: 'No live account or connection was tested by this research.',
      effort: null,
      blocker: null,
    },
    {
      id: 'zerodha-verify-account-plan',
      title: 'Confirm account eligibility and the current API plan',
      detail: reviewedStep(
        'Kite Connect lists an active Zerodha trading account and two-factor authentication as prerequisites. Confirm your account and the plan that fits your intended API use in the provider console.',
        overview,
        'setup',
        eligibilityText,
      ),
      owner: 'Human',
      stage: 'Verify',
      routes: ['custom'],
      url: overview.url,
      note: 'The app does not inspect your account or confirm plan eligibility.',
      effort: null,
      blocker: null,
    },
    {
      id: 'zerodha-confirm-launch-requirements',
      title: 'Confirm requirements for your intended launch',
      detail: unresolved(
        'Provider review, Composio compatibility, and any trading compliance are still unknown for your application and use case. Resolve those questions before external release.',
        [overview.id, login.id, ...(tradingRules ? [tradingRules.id] : [])],
      ),
      owner: 'Human',
      stage: 'Launch',
      routes: ['custom'],
      url: tradingRules?.url ?? overview.url,
      note: 'This guide does not verify an approval or a connected account.',
      effort: null,
      blocker: 'Composio compatibility and use-case-specific provider requirements remain unknown.',
    },
  ];

  const approvalDetails: Guide['approvalDetails'] = [
    {
      title: 'OAuth application review and external distribution',
      detail: unresolved(
        'The retrieved Kite Connect setup and login documentation does not establish a general OAuth application review requirement or a review timeline. Check your account, API plan, and intended distribution with Zerodha.',
        [overview.id, login.id],
      ),
    },
  ];
  if (tradingRules) {
    const rulePassage = passage(tradingRules, /\b(?:NSE|SEBI)\b[\s\S]{0,900}\b(?:algo|algorithm|automated trading)\b/i, 1200);
    if (rulePassage) {
      approvalDetails.push({
        title: 'Trading compliance (conditional on your use case)',
        detail: unresolved(
          'This source discusses rules for automated trading activity. It is not a general OAuth app approval requirement; verify whether it applies to your trading use case and current account.',
          [tradingRules.id],
        ),
      });
    }
  }

  guide.steps = steps;
  guide.approval = 'unknown';
  guide.approvalTime = unresolved('No provider review timeline was established in the retrieved sources.', [overview.id, login.id]);
  guide.approvalEvidence = unresolved('Provider app review requirements remain unknown for this application and distribution route.', [overview.id, login.id]);
  guide.approvalDetails = approvalDetails;
  guide.managedEvidence = unresolved(
    'Composio managed authentication for Kite Connect is not confirmed by the retrieved docs. The documentation explains managed auth generally but does not identify a Kite Connect managed scheme.',
    composioIds,
  );
  guide.difficulty = 'Unknown';
  guide.difficultyExplanation = unresolved('Composio compatibility with the provider-specific Kite Connect flow has not been established.', composioIds);
  guide.setupEffort = unresolved('Effort is unknown until Composio compatibility and the required API plan are confirmed.', [overview.id, ...composioIds]);
  guide.mainBlocker = unresolved('The main blocker is confirming that the chosen Composio route can support Kite Connect’s request_token/checksum exchange.', composioIds);
  guide.prerequisites = [
    'Confirm Composio support for Kite Connect’s provider-specific token exchange.',
    'Confirm Kite Connect account eligibility and current API plan with Zerodha.',
    'Keep the provider API secret on your server; never enter it in Auth0Genius.',
  ];
  guide.humanResponsibilities = [
    'Confirm API-plan and account eligibility in the Zerodha console.',
    'Register the Kite Connect application and redirect URL if proceeding.',
    'Keep the API secret and user tokens in your own server-side secret store.',
    'Test the account connection and verify any use-case-specific trading obligations.',
  ];
  guide.agentResponsibilities = [
    'Retrieve and summarize public Kite Connect authentication and setup documentation.',
    'Explain the request_token/checksum exchange and identify unresolved Composio compatibility.',
    'Keep provider application review and trading compliance as separate questions.',
  ];
  guide.unknowns = [
    'Whether Composio managed auth or a custom auth config supports Kite Connect’s proprietary token exchange.',
    'The exact Kite Connect plan and account eligibility for this developer.',
    'Any approval, distribution, or trading-compliance obligations specific to the intended use case.',
  ];
  guide.status = 'partial';
  guide.description = 'Kite Connect documents an OAuth-style, provider-specific login and token exchange. Confirm Composio compatibility before implementation.';
  return guide;
}
