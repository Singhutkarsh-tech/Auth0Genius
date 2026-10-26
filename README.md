# Auth0Genius

**From integration idea to production-ready OAuth.** Auth0Genius helps developers using Composio understand provider authentication, prepare a setup plan, and identify launch blockers—with source evidence and explicit unknowns.

**Working experience:** [auth0-genius.vercel.app](https://auth0-genius.vercel.app/)

**Source repository:** [github.com/Singhutkarsh-tech/Auth0Genius](https://github.com/Singhutkarsh-tech/Auth0Genius)

The application is deployed and ready to try—open the demo link and browse the saved guides; no installation or account is needed. The public homepage, provider API, and Figma guide were reachable when checked on 20 October 2026. For a local copy, use the steps below.

## Try it

Explore Gmail, Slack, and GitHub for different OAuth setup and distribution considerations, then browse the ten-provider library. To see live research, enter an unfamiliar provider name or URL in the search field and follow the research stages while they run. The URL flow keeps the submitted domain as the identity clue, checks public pages and official documentation, asks for confirmation when identity is ambiguous, and reuses a saved guide when one already exists.

A fresh direct-URL Figma run resolved `https://www.figma.com` to the Figma design platform, retrieved its developer documentation, generated and saved a partial guide, and reopened it after an application restart. OAuth 2.0 was supported by retrieved evidence; Composio-managed availability and approval requirements remained unknown. The [run record](docs/live-research-direct-figma.json), [research audit](docs/research-audit.md), and [validation report](docs/validation.md) include the evidence and limitations.

## Run locally

Requires Node.js 22.16+ and npm. Saved guides work without research credentials; live research needs server-side OpenAI and Tavily keys.

```sh
npm ci
cp -n .env.example .env
# Add OPENAI_API_KEY and TAVILY_API_KEY to the ignored .env for live research.
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Never commit `.env` or expose research keys to the browser. For durable hosted data, use PostgreSQL; see [Supabase and Vercel deployment instructions](docs/deployment.md).

## Key decisions

- **Evidence before certainty:** official provider and Composio documentation are preferred. Search snippets and model confidence are not treated as proof; unresolved claims stay unknown and guides can be partial.
- **Managed auth first:** the guide explains the Composio-managed route before recommending custom provider credentials. Route-specific checklists and user-reported progress help developers choose and track work.
- **Identity follows the URL:** a submitted website is validated and retained through research. Similar names or conflicting sources trigger confirmation rather than a silent provider switch.
- **Research is bounded and server-side:** retrieval and synthesis have limits; credentials stay on the server. The app advises and prepares—it does not register apps, handle secrets, or submit provider approvals.
- **Focused library:** ten researched providers provide useful variation in setup and review requirements instead of many shallow entries.

## Validation

Run the automated checks with:

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The recorded local validation and real-provider research results are in [docs/validation.md](docs/validation.md). A real research run requires configured API keys; mocked tests do not count as live research.

## Limitations

- Provider policies, scopes, managed-auth availability, and approval requirements can change. Confirm account-specific requirements with the provider before launch; some guide fields intentionally remain unknown.
- Checklist state is local to the browser and is user-reported, not confirmation that external setup is complete.
- Live research is a bounded, browser-driven workflow; closing all research tabs can pause it between stages.
- The deployed experience and saved guides are reachable. A fresh Steam research job completed against production and its saved partial guide is available at [auth0-genius.vercel.app/providers/steam](https://auth0-genius.vercel.app/providers/steam). OAuth support remains unknown because retrieved Steam pages did not establish an OAuth flow. Persistence across the next production deployment has not yet been rechecked.
- This proof of concept has no accounts, billing, credential vault, or OAuth token handling.
