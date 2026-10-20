import { validateEvidence, type Guide, type Claim, type Source } from '@/lib/validation';
const checked = '2026-10-20T04:47:19.000Z';
const c = (
  text: string,
  sourceIds: string[] = [],
  status: Claim['status'] = sourceIds.length ? 'verified' : 'unverified',
): Claim => ({ text, sourceIds, status });
const source = (id: string, title: string, url: string, summary: string): Source => ({
  id,
  title,
  url,
  summary,
  domain: new URL(url).hostname,
  type: 'official',
  accessedAt: checked,
});
const composio = source(
  'composio',
  'Composio: managed vs custom authentication',
  'https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app',
  'Managed OAuth is documented for Gmail, Slack and GitHub. Custom auth configs supply your credentials and scopes; the dashboard shows the provider callback.',
);
const callback = source(
  'callback',
  'Composio: custom auth configuration',
  'https://docs.composio.dev/docs/auth-configuration/custom-auth-configs',
  'The registered provider redirect URI must match oauth_redirect_uri in the active auth config. A v3 callback is documented; some defaults still use a supported v1 callback.',
);
type Spec = {
  slug: string;
  name: string;
  website: string;
  description: string;
  category: string;
  aliases: string[];
  difficulty: Guide['difficulty'];
  effort: string;
  reason: string;
  blocker: string;
  docs: string;
  summary: string;
  steps: [string, string, Guide['steps'][number]['stage']][];
  approval: string;
  extra?: Source[];
  approvalSource?: string;
  unknowns?: string[];
  issue: [string, string, string];
};
const specs: Spec[] = [
  {
    slug: 'gmail',
    name: 'Gmail',
    website: 'https://gmail.com',
    description: 'Connect email, threads, labels, and drafts to your agent.',
    category: 'Email',
    aliases: ['google mail', 'gmail.com', 'mail.google.com', 'google gmail'],
    difficulty: 'Complex',
    effort: '45–90 min, estimated',
    reason:
      'Estimate assumes an existing Cloud project and a small scope set. Verification preparation and security assessment are excluded.',
    blocker: 'Restricted Gmail scopes may require verification and a security assessment.',
    docs: 'https://developers.google.com/workspace/gmail/api/auth/scopes',
    summary:
      'Gmail uses OAuth scopes. gmail.send is sensitive; gmail.readonly and gmail.modify are restricted. Server storage or transmission of restricted data requires a security assessment.',
    steps: [
      [
        'Choose the smallest Gmail scope set',
        'Map agent actions to scopes. gmail.send is sensitive; gmail.readonly and gmail.modify are restricted. Avoid broad mailbox access unless needed.',
        'Register',
      ],
      [
        'Create a Google Cloud project and enable Gmail',
        'Use a project you control. Enable the Gmail API before creating web application credentials.',
        'Register',
      ],
      [
        'Configure consent, audience, and test users',
        'In Google Auth Platform, configure branding, audience, and data access. Add intended testers while using the external testing route.',
        'Configure',
      ],
      [
        'Register a web OAuth client and callback',
        'Create a Web application OAuth client. Add the exact provider callback from your Composio auth config.',
        'Configure',
      ],
      [
        'Test with an allowed Google account',
        'Connect an allowed test user through Composio and exercise only your selected Gmail actions. Testing is not production approval.',
        'Test',
      ],
      [
        'Prepare scope verification for external launch',
        'Review the requirements for your exact scopes and distribution. Restricted data handled on servers can trigger a security assessment.',
        'Verify',
      ],
      [
        'Confirm production audience and approved scopes',
        'Confirm the consent configuration, any required verification, and the actual scopes before external launch.',
        'Launch',
      ],
    ],
    approval:
      'External use of sensitive or restricted scopes can require Google verification. Restricted data stored or transmitted on servers requires a security assessment. Internal/testing exceptions must be evaluated for your route. Workspace Marketplace listing is separate.',
    extra: [
      source(
        'google-consent',
        'Google: consent screen setup',
        'https://developers.google.com/workspace/guides/configure-oauth-consent',
        'Configure branding, audience, data access and test users in Google Auth Platform.',
      ),
      source(
        'google-client',
        'Google: create access credentials',
        'https://developers.google.com/workspace/guides/create-credentials',
        'Enable the API and create OAuth client credentials for the application type.',
      ),
    ],
    issue: [
      'Unverified app or access blocked',
      'The consent audience, test user list, or sensitive scope verification can restrict authorization.',
      'Confirm the tester is allowed and review scope verification before changing distribution.',
    ],
  },
  {
    slug: 'slack',
    name: 'Slack',
    website: 'https://slack.com',
    description: 'Bring workspace conversations and actions into your agent.',
    category: 'Communication',
    aliases: ['slack.com', 'slack api'],
    difficulty: 'Moderate',
    effort: '30–60 min, estimated',
    reason:
      'Estimate covers app registration, minimal scopes, and one development workspace test; commercial review preparation is excluded.',
    blocker:
      'Commercial distribution requires Slack Marketplace consideration; workspace admins may also gate installs.',
    docs: 'https://docs.slack.dev/authentication/installing-with-oauth/',
    summary:
      'Slack uses OAuth v2, separates bot and user scopes, requires HTTPS redirects, and documents bad_redirect_uri and invalid_scope errors.',
    steps: [
      [
        'Create a Slack app in a development workspace',
        'Create your app in Slack App Management and choose its development workspace.',
        'Register',
      ],
      [
        'Choose bot or user permissions',
        'In OAuth & Permissions, choose only necessary scopes. Bot scopes and user scopes serve different identities; Sign in with Slack scopes use a separate flow.',
        'Configure',
      ],
      [
        'Add your HTTPS redirect URL',
        'Add the callback supplied by your active Composio auth config in OAuth & Permissions.',
        'Configure',
      ],
      [
        'Install and test in your development workspace',
        'Authorize through Composio. Test permissions with a safe channel and check that bot/user scopes match the intended actions.',
        'Test',
      ],
      [
        'Choose pilot or commercial distribution',
        'Use Manage Distribution for a pilot in other workspaces. Review Marketplace requirements for commercial distribution before launching.',
        'Verify',
      ],
      [
        'Confirm workspace policy and distribution readiness',
        'Check target-workspace admin consent and the distribution route. A successful development installation does not establish commercial approval.',
        'Launch',
      ],
    ],
    approval:
      'A development workspace install is distinct from unlisted distribution. Unlisted distribution supports pilots; Slack directs commercially distributed apps to Marketplace submission and approval. Workspace admin approval is a separate gate.',
    extra: [
      source(
        'distribution',
        'Slack: app lifecycle and distribution',
        'https://docs.slack.dev/app-management/distribution/',
        'Single-workspace apps, unlisted pilot distribution, and reviewed Marketplace distribution are different routes. Commercial apps should be submitted and approved for Marketplace listing.',
      ),
    ],
    approvalSource: 'distribution',
    issue: [
      'invalid_team_for_non_distributed_app',
      'An undistributed app is being authorized outside its development workspace.',
      'Complete the Manage Distribution checklist for a pilot; review commercial policies for production.',
    ],
  },
  {
    slug: 'github',
    name: 'GitHub',
    website: 'https://github.com',
    description: 'Give your agent access to repositories, issues, and code.',
    category: 'Developer tools',
    aliases: ['github.com', 'git hub'],
    difficulty: 'Easy',
    effort: '15–30 min, estimated',
    reason:
      'Estimate assumes an account with permission to register an OAuth app and one personal-account test. Organization policy review is excluded.',
    blocker:
      'Organization OAuth app restrictions can block repository access after personal authorization.',
    docs: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
    summary:
      'Register in Settings → Developer settings → OAuth apps. Configure a name, homepage and callback. GitHub recommends considering GitHub Apps for finer permissions.',
    steps: [
      [
        'Confirm the OAuth App route fits your agent',
        'GitHub recommends considering GitHub Apps for granular permissions. Confirm the Composio toolkit supports your selected app type before choosing.',
        'Register',
      ],
      [
        'Register an OAuth App in Developer settings',
        'Open Settings → Developer settings → OAuth apps → New OAuth App. Use a public application name and homepage.',
        'Register',
      ],
      [
        'Configure callback and minimal scopes',
        'Register the provider callback from Composio. Select scopes for the required API actions rather than assuming repo is always needed.',
        'Configure',
      ],
      [
        'Test a personal-account connection',
        'Add your credentials only in Composio, authorize your own account, and verify a safe repository operation.',
        'Test',
      ],
      [
        'Request organization owner approval if restricted',
        'For organization data, check OAuth app restrictions. Members may need an owner to approve the app.',
        'Verify',
      ],
      [
        'Validate target organization access before launch',
        'Test against the intended organization and review any Marketplace requirements separately if you plan a listing.',
        'Launch',
      ],
    ],
    approval:
      'The documented OAuth registration route does not include universal provider review before personal authorization. Organization access restrictions can require an owner’s approval. A Marketplace listing is a separate route, not established by app registration.',
    extra: [
      source(
        'github-policy',
        'GitHub: organization OAuth access restrictions',
        'https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions',
        'Organization policy can prevent OAuth app access to organization data. Users can request owner approval.',
      ),
      source(
        'github-scopes',
        'GitHub: OAuth app scopes',
        'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps',
        'Scopes limit OAuth access; request only those needed for your actions.',
      ),
    ],
    approvalSource: 'github-policy',
    issue: [
      'Personal authorization works but repositories are missing',
      'The organization can restrict OAuth access independently of personal consent.',
      'Request organization owner approval and check that the connection has the necessary scopes.',
    ],
  },
  {
    slug: 'notion',
    name: 'Notion',
    website: 'https://www.notion.com',
    description: 'Connect knowledge, pages, and workspace databases.',
    category: 'Productivity',
    aliases: ['notion.so', 'notion.com'],
    difficulty: 'Moderate',
    effort: '30–60 min, estimated',
    reason:
      'Estimate assumes developer portal access. Public connection review and installation scope must be confirmed.',
    blocker:
      'Choose the public connection installation scope carefully; it cannot be changed after creation.',
    docs: 'https://developers.notion.com/guides/get-started/authorization',
    summary:
      'Public connections use OAuth; internal connections use static tokens. Public creation includes redirect URIs and a fixed installation scope. Users select accessible pages; listings are managed separately.',
    steps: [
      [
        'Create a public connection',
        'Use the Developer portal. Choose Any workspace or Selected workspaces only; this selection cannot be changed later.',
        'Register',
      ],
      [
        'Configure capabilities and OAuth redirect',
        'Set the capabilities your agent needs and the callback from Composio. Confirm review and authorization URL availability in the portal.',
        'Configure',
      ],
      [
        'Authorize and select test pages',
        'Run OAuth, select a page you can share, and test access to that page. OAuth does not grant the entire workspace.',
        'Test',
      ],
      [
        'Confirm public connection review and listing route',
        'The docs refer to review before the authorization URL is populated. Confirm your connection’s review state; Marketplace listings are managed separately.',
        'Verify',
      ],
    ],
    approval:
      'Public connection documentation refers to review and a separate Marketplace listing workflow. Confirm the exact review gate for your installation scope in the portal; do not assume app creation enables unrestricted installation.',
    unknowns: [
      'Public connection review turnaround and exact eligibility for the chosen installation scope.',
    ],
    issue: [
      'A page cannot be found',
      'The user may not have shared the page with the connection.',
      'Reauthorize and select the page using an account with permission to share it.',
    ],
  },
  {
    slug: 'outlook',
    name: 'Microsoft Outlook',
    website: 'https://outlook.com',
    description: 'Access email and calendars through Microsoft Graph.',
    category: 'Email',
    aliases: [
      'microsoft outlook',
      'outlook.com',
      'office365',
      'microsoft identity platform',
      'microsoft 365',
    ],
    difficulty: 'Moderate',
    effort: '30–60 min, estimated',
    reason:
      'Estimate covers Entra registration and one delegated permission test. Tenant approval is excluded.',
    blocker: 'Tenant consent policy or admin-only permissions may prevent user authorization.',
    docs: 'https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app',
    summary:
      'Register in Microsoft Entra ID, select supported account types, and configure a web redirect URI.',
    steps: [
      [
        'Register an application in Microsoft Entra ID',
        'Create an app registration and choose supported account types for your intended audience.',
        'Register',
      ],
      [
        'Configure Graph delegated permissions',
        'Add only the Microsoft Graph delegated permissions required by your mail or calendar use case. Check whether each needs admin consent.',
        'Configure',
      ],
      [
        'Configure a web redirect and credentials',
        'Register the Composio callback under the web platform. Store credentials in Composio, never this guide.',
        'Configure',
      ],
      [
        'Test consent in the target tenant',
        'Authorize a test user and inspect whether tenant policy requires an administrator.',
        'Test',
      ],
      [
        'Resolve admin consent and publisher requirements',
        'Review target tenant policy and any publisher verification requirements for your distribution.',
        'Verify',
      ],
    ],
    approval:
      'Delegated permissions and application permissions differ. Application permissions require admin consent; delegated access may also require an admin under tenant policy. Publisher verification does not replace consent.',
    extra: [
      source(
        'graph-permissions',
        'Microsoft: Graph permissions overview',
        'https://learn.microsoft.com/en-us/graph/permissions-overview',
        'Delegated access acts for a user; application access acts without a signed-in user. Consent requirements depend on permission and tenant policies.',
      ),
    ],
    approvalSource: 'graph-permissions',
    issue: [
      'Need admin approval',
      'The tenant disallows user consent or the requested permission needs an administrator.',
      'Ask the tenant administrator to review the app and requested permissions.',
    ],
  },
  {
    slug: 'salesforce',
    name: 'Salesforce',
    website: 'https://www.salesforce.com',
    description: 'Connect CRM records with an organization-aware OAuth route.',
    category: 'CRM',
    aliases: ['salesforce.com', 'sfdc'],
    difficulty: 'Complex',
    effort: '45–90 min, estimated',
    reason:
      'Estimate assumes an eligible org and admin access. Packaging, partner security review and commercial distribution are excluded.',
    blocker: 'New Connected App creation is restricted; use the External Client App route.',
    docs: 'https://developer.salesforce.com/docs/platform/api-rest/guide/intro-oauth-and-connected-apps.html',
    summary:
      'REST access uses OAuth through External Client Apps or Connected Apps. Spring ’26 restricts new Connected App creation; Salesforce recommends External Client Apps.',
    steps: [
      [
        'Use an External Client App for a new integration',
        'Ask your org administrator to use the current External Client App setup route. Existing Connected Apps can continue; new creation is restricted.',
        'Register',
      ],
      [
        'Confirm OAuth settings for your org',
        'Configure your callback and required OAuth permissions using the current External Client App documentation. Verify the auth flow against your Composio toolkit.',
        'Configure',
      ],
      [
        'Test in an eligible org',
        'Use a test org and confirm API access and user authorization policy before touching production records.',
        'Test',
      ],
      [
        'Confirm distribution and security review separately',
        'Determine whether your delivery route includes AppExchange or partner security review. This guide has not verified those requirements.',
        'Verify',
      ],
    ],
    approval:
      'OAuth authorization is documented, but requirements for your packaging, distribution and security review route are not established by the retrieved REST overview.',
    unknowns: [
      'External Client App distribution configuration and Composio compatibility for the exact org.',
      'AppExchange security review requirements for the intended distribution.',
    ],
    issue: [
      'Cannot create a Connected App',
      'Salesforce restricts new Connected App creation starting Spring ’26.',
      'Use External Client Apps; contact Salesforce Support if you require the legacy route.',
    ],
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    website: 'https://www.hubspot.com',
    description: 'Bring CRM contacts and customer workflows into your agent.',
    category: 'CRM',
    aliases: ['hubspot.com', 'hub spot'],
    difficulty: 'Moderate',
    effort: '30–60 min, estimated',
    reason:
      'Estimate covers basic project setup and a test connection, not migration or marketplace review.',
    blocker: 'New accounts cannot create legacy public apps; use the current developer platform.',
    docs: 'https://developers.hubspot.com/docs/guides/apps/public-apps/overview',
    summary:
      'Legacy public apps use OAuth. New account creation of legacy public apps stopped May 26, 2026. The current developer platform supports OAuth and allowlisted or marketplace distribution.',
    steps: [
      [
        'Start on the current HubSpot developer platform',
        'Use a project-based app for new work. New accounts cannot create legacy public apps after May 26, 2026.',
        'Register',
      ],
      [
        'Configure OAuth for the project app',
        'Follow the current platform setup to configure redirect URLs and permissions for the required CRM actions. Confirm the installed platform version.',
        'Configure',
      ],
      [
        'Test with a developer account',
        'Run a Composio connection using your app and test a narrow CRM read operation. Confirm the target account is eligible.',
        'Test',
      ],
      [
        'Choose allowlisted or Marketplace distribution',
        'Confirm which distribution mode fits your audience and review its current limits before external launch.',
        'Verify',
      ],
    ],
    approval:
      'The latest developer platform supports allowlisted and Marketplace distribution. The legacy public-app documentation does not establish approval conditions for every current project version.',
    extra: [
      source(
        'hubspot-platform',
        'HubSpot: developer platform onboarding',
        'https://developers.hubspot.com/developer-platform-basics',
        'The current platform uses CLI projects and date-based platform versions. Start with hs get-started.',
      ),
    ],
    unknowns: [
      'Current project-version distribution limits, exact scope eligibility and review turnaround.',
    ],
    issue: [
      'Legacy public app creation is unavailable',
      'New accounts no longer support creating legacy public apps.',
      'Create an app with the current developer platform instead.',
    ],
  },
  {
    slug: 'dropbox',
    name: 'Dropbox',
    website: 'https://www.dropbox.com',
    description: 'Connect files, folders, and content workflows.',
    category: 'Storage',
    aliases: ['dropbox.com'],
    difficulty: 'Moderate',
    effort: '20–45 min, estimated',
    reason:
      'Estimate covers a scoped app and one connection test. Production review effort is not included.',
    blocker: 'App Folder access cannot read arbitrary existing Dropbox content.',
    docs: 'https://docs.dropboxapi.com/dropbox-api/docs/oauth',
    summary:
      'Create an app in App Console, choose App Folder or Full Dropbox, select scopes, and register exact redirect URIs. Background access uses refresh tokens.',
    steps: [
      [
        'Register a scoped Dropbox app',
        'In App Console, choose App Folder for app-owned content or Full Dropbox for appropriate access to existing content.',
        'Register',
      ],
      [
        'Select permissions and exact redirects',
        'Choose endpoint-specific scopes in Permissions. Register the exact Composio callback.',
        'Configure',
      ],
      [
        'Test an end-user OAuth connection',
        'Use Composio to connect your test account and read an allowed test file. A generated console token only tests your own account.',
        'Test',
      ],
      [
        'Confirm production status in App Console',
        'Review current production eligibility and app review requirements before broad distribution. The OAuth guide alone does not establish your production status.',
        'Verify',
      ],
    ],
    approval:
      'The OAuth documentation references app review but does not establish a production approval threshold or timeline for this specific app. Confirm production requirements in App Console.',
    unknowns: ['Current production approval thresholds and review timing.'],
    issue: [
      'A file is unavailable after connection',
      'App Folder access or a missing file scope may exclude the target file.',
      'Check the app’s content access setting and the scope required by the endpoint.',
    ],
  },
  {
    slug: 'linear',
    name: 'Linear',
    website: 'https://linear.app',
    description: 'Let your agent collaborate on issues and projects.',
    category: 'Developer tools',
    aliases: ['linear.app', 'linear app'],
    difficulty: 'Easy',
    effort: '15–30 min, estimated',
    reason: 'Estimate assumes workspace administrator access and a basic read-only connection.',
    blocker: 'Broad write or admin permissions may exceed what your agent needs.',
    docs: 'https://linear.app/developers/oauth-2-0-authentication',
    summary:
      'Create an OAuth2 application, configure callback URLs and scopes. read is always present; targeted issue/comment scopes exist. OAuth apps use refresh tokens following the April 2026 migration.',
    steps: [
      [
        'Create an OAuth2 application',
        'Use Linear’s OAuth application settings in a workspace dedicated to app management where appropriate.',
        'Register',
      ],
      [
        'Configure callback and minimal scopes',
        'Register your Composio callback and choose read or targeted create scopes. Request admin only when essential.',
        'Configure',
      ],
      [
        'Test a user connection and actor behavior',
        'Connect through Composio and test an issue read. Confirm whether actions should appear as the user or app.',
        'Test',
      ],
      [
        'Confirm distribution requirements',
        'Check Integration Directory requirements if seeking a listing. The retrieved OAuth page does not establish a universal approval requirement.',
        'Verify',
      ],
    ],
    approval:
      'The OAuth page documents app registration and authorization. Integration Directory listing requirements and general distribution approval were not established by the retrieved source.',
    unknowns: [
      'Integration Directory review requirements and distribution policy for this specific app.',
    ],
    issue: [
      'Actions appear under an unexpected identity',
      'The OAuth actor mode can select user or app identity.',
      'Confirm actor behavior supported by your Composio configuration and the Linear use case.',
    ],
  },
  {
    slug: 'zoom',
    name: 'Zoom',
    website: 'https://zoom.us',
    description: 'Connect meetings and authorized video collaboration data.',
    category: 'Communication',
    aliases: ['zoom.us', 'zoom.com', 'zoom meetings'],
    difficulty: 'Complex',
    effort: '45–90 min, estimated',
    reason:
      'Estimate covers OAuth app setup and an account-level test. Marketplace preparation and review are excluded.',
    blocker:
      'Public external distribution requires Marketplace review; development testing is separate.',
    docs: 'https://developers.zoom.us/docs/integrations/oauth/',
    summary:
      'Zoom supports user-authorized OAuth. Configure redirect URLs and requested scopes for the application.',
    steps: [
      [
        'Create an OAuth app with developer permissions',
        'Use Zoom’s app creation flow and an account with the necessary developer role. Choose user-authorized OAuth for end-user connections.',
        'Register',
      ],
      [
        'Configure redirect, allowlist and scopes',
        'Add the Composio callback in the OAuth settings and select only necessary Zoom permissions.',
        'Configure',
      ],
      [
        'Test with development credentials',
        'Use the development configuration to authorize an eligible test account. A successful test does not establish public distribution approval.',
        'Test',
      ],
      [
        'Prepare external distribution review',
        'Public Marketplace publication requires review. Prepare terms, privacy policy, support and documentation for the intended distribution.',
        'Verify',
      ],
      [
        'Confirm publishing and account policies',
        'Verify the actual review outcome and target-account installation policies in Zoom before external release.',
        'Launch',
      ],
    ],
    approval:
      'External Marketplace publication requires review, including security evaluation. Apps limited to users within your Zoom account do not require standard Marketplace review. Support documentation, privacy policy and terms are required for published apps.',
    extra: [
      source(
        'zoom-distribution',
        'Zoom: app distribution',
        'https://developers.zoom.us/docs/distribute/',
        'External published apps undergo Marketplace and security review; internal-account apps do not require standard review.',
      ),
      source(
        'zoom-create',
        'Zoom: create an OAuth app',
        'https://developers.zoom.us/docs/integrations/create/',
        'App creation requires developer permissions and separates development and production credentials.',
      ),
    ],
    approvalSource: 'zoom-distribution',
    issue: [
      'External users cannot install the app',
      'Development mode or distribution restrictions may exclude the user.',
      'Check the intended audience, publication state, and target account’s installation policy.',
    ],
  },
];
export const seedGuides: Guide[] = specs.map((s) => {
  const sources = [
    source('provider', `${s.name}: OAuth documentation`, s.docs, s.summary),
    ...(s.extra ?? []),
    composio,
    callback,
  ];
  const featured = ['gmail', 'slack', 'github'].includes(s.slug);
  const policy = s.approvalSource ?? 'provider';
  const steps: Guide['steps'] = s.steps.map(([title, detail, stage], index) => ({
    id: `${s.slug}-${index + 1}`,
    title,
    detail: c(detail, [
      s.slug === 'gmail' && [1, 2, 3].includes(index)
        ? index === 1 || index === 3
          ? 'google-client'
          : 'google-consent'
        : (s.slug === 'github' && index === 4) || (s.slug === 'slack' && index >= 4)
          ? policy
          : 'provider',
    ]),
    stage,
    owner: stage === 'Configure' ? 'Shared' : 'Human',
    url: sources.find((src) => src.id === (s.slug === 'slack' && index >= 4 ? policy : 'provider'))!
      .url,
    note: null,
    effort: null,
    blocker: stage === 'Verify' ? s.blocker : null,
  }));
  steps.splice(
    steps.findIndex((st) => st.stage === 'Test'),
    0,
    {
      id: `${s.slug}-composio`,
      title: 'Create your custom Composio auth config',
      detail: c(
        'Select the toolkit and OAuth2 scheme in Composio. Enter your provider credentials there, confirm scopes and callback, and use the resulting auth config ID for connections.',
        ['composio'],
      ),
      owner: 'Human',
      stage: 'Configure',
      url: 'https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app',
      note: 'Never paste client secrets or tokens into Auth0Genius.',
      effort: null,
      blocker: null,
    },
  );
  return validateEvidence({
    slug: s.slug,
    name: s.name,
    website: s.website,
    description: s.description,
    category: s.category,
    aliases: s.aliases,
    logo: `/logos/${s.slug}.svg`,
    featured,
    version: 1,
    status: featured ? 'sourced' : 'partial',
    oauthStatus: 'supported',
    oauthEvidence: c('OAuth support is documented by the provider.', ['provider']),
    managedAuth: featured ? 'available' : 'unknown',
    managedEvidence: featured
      ? c(
          'Composio documents managed OAuth for this toolkit. Confirm that its default scopes fit your use case.',
          ['composio'],
        )
      : c(
          'Provider-specific managed OAuth availability was not established. Check the current Composio toolkit dashboard before registering a custom app.',
        ),
    difficulty: s.difficulty,
    difficultyExplanation: c(s.reason, [], 'estimated'),
    setupEffort: c(s.effort, [], 'estimated'),
    approval: ['salesforce', 'hubspot', 'dropbox', 'linear'].includes(s.slug)
      ? 'unknown'
      : 'conditional',
    approvalTime: c('Timeline not established for this route'),
    mainBlocker: c(s.blocker, [policy]),
    prerequisites: [
      'A provider account with permission to create and configure an application',
      'A Composio project and a defined agent use case',
      'A minimal permission list and the callback from your active auth config',
    ],
    steps,
    approvalDetails: [
      { title: 'Testing, external use & review', detail: c(s.approval, [policy]) },
      {
        title: 'Timing and actual approval',
        detail: c(
          'No review-duration promise is made. Confirm submission requirements and actual approval in the provider console.',
        ),
      },
    ],
    troubleshooting: [
      { symptom: s.issue[0], reason: c(s.issue[1], [policy]), action: s.issue[2] },
      {
        symptom: 'Redirect URI mismatch',
        reason: c('The provider registration and Composio oauth_redirect_uri can differ.', [
          'callback',
        ]),
        action:
          'Copy the callback from your active Composio auth config and register the identical value with the provider.',
      },
    ],
    agentResponsibilities: [
      'Find and summarize public official documentation',
      'Prepare a scope and approval checklist',
      'Identify documented setup blockers',
    ],
    humanResponsibilities: [
      'Log into provider and Composio consoles',
      'Accept agreements and manage application credentials',
      'Verify domains and submit required review documents',
      'Confirm real test results and approval outcomes',
    ],
    unknowns: [
      ...(s.unknowns ?? []),
      'Exact approval wait for your app and scope set.',
      'Your account eligibility, chosen scopes, and actual provider approval outcome.',
    ],
    sources,
    generatedAt: checked,
    checkedAt: checked,
    provenance: {
      method: 'seed_research',
      attempted: [
        'Accessed official OAuth documentation during the build',
        'Compared setup and distribution guidance',
        'Reviewed Composio managed and custom auth documentation',
      ],
      limitations: [
        'No provider console sign-in or OAuth connection was performed.',
        'Sourced means documentation-backed; it does not mean provider-approved.',
      ],
    },
  });
});
