# Auth0Genius

**From integration idea to production-ready OAuth.**

An independent Composio product concept: an OAuth launchpad for agent developers. Search a provider, understand managed versus custom authentication, see setup work separately from provider waiting, and follow a source-backed launch plan. This is an advisory product, not an OAuth server or credential vault.

![Auth0Genius homepage](docs/screenshots/home-desktop.png)

## Run locally

Requires Node.js **22.16+** (tested on 24.12) and npm.

```sh
npm ci
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. Existing guides work without AI keys. Seeding is repeatable and does not duplicate providers. Never commit `.env` or database files.

| Variable                 | Purpose                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`           | Local: `file:./dev.db` (relative to `prisma/`). Production: a durable hosted PostgreSQL connection URL.            |
| `OPENAI_API_KEY`         | Server-only structured guide synthesis and provider identification.                                                |
| `TAVILY_API_KEY`         | Server-only live web search.                                                                                       |
| `OPENAI_MODEL`           | Optional synthesis model; defaults to `gpt-4.1-mini`. Must support Responses structured outputs.                   |
| `NEXT_PUBLIC_APP_URL`    | Application origin, e.g. `http://localhost:3000` or the actual deployed HTTPS origin.                              |
| `NEXT_PUBLIC_GITHUB_URL` | Optional real repository URL; the navigation hides this link when unset.                                           |
| `RESEARCH_ACCESS_CODE`   | Optional shared deployment access code for cost control. It is validated server-side; it is not an account system. |

## The experience

- Homepage with exactly three featured providers: **Gmail, Slack, GitHub**.
- Ten guides with provider-specific requirements: Gmail, Slack, GitHub, Notion, Microsoft Outlook, Salesforce, HubSpot, Dropbox, Linear and Zoom.
- Search by name, alias, domain or partial text; `/` and Cmd/Ctrl+K focus search. Unknown providers lead to an explicit investigation.
- A practical guide workspace: readiness summary, managed/custom choice, local version-scoped checklist, Register → Configure → Test → Verify → Launch, next action, approval gates, owners, troubleshooting, sources and unknowns.
- Locally reported completion and blockers are never presented as externally verified actions.
- Persistent guide URLs and a copy-link action. Generated guides are independent of their original job page.
- Responsive desktop/mobile layouts, local Geist fonts, real locally stored provider marks, keyboard controls, loading and error states.

Ten providers provide enough variety to demonstrate Gmail scope verification, Slack distribution policy, GitHub organization restrictions, tenant consent, developer-platform changes, and marketplace review. One hundred shallow guides would reduce evidence quality and hide the difficult product decisions.

## Architecture

A strict TypeScript **Next.js App Router modular monolith**. React and Tailwind power the UI; Prisma handles relational persistence, with JSON guide content validated by Zod. Small shared UI primitives use the shadcn convention of locally owned components. CSS transitions respect reduced-motion preferences.

```text
src/app/                  Pages and JSON API routes
src/components/           Search, directory, guide and research workspaces
src/data/seed-providers.ts Provider-specific build-time research
src/lib/validation.ts     Guide/claim/source/step schemas and evidence validation
src/lib/db/               Prisma client, guide reads and transactional writes
src/lib/research/         Retrieval, safe network access, synthesis, state and quotas
prisma/                   SQLite and PostgreSQL schemas; idempotent seed
scripts/                  Database selection, live run and browser fixture helpers
tests/                    Unit, mocked pipeline integration and browser checks
docs/                     Research audit, validation report and screenshots
```

Core records: `Provider`, versioned `Guide`, `EvidenceSource`, `ResearchJob` and `ResearchQuota`. Metadata columns support filtering; the validated JSON content preserves claim-level citations and research provenance. Generated writes and evidence sources are committed together. Saved seed content provides a read fallback during database outages; new research never pretends to save without a database.

Prisma **6.19.3** is pinned through the lockfile for the conventional SQLite/PostgreSQL engine setup. The currently published `latest` Prisma tag resolved to an 8.0 release candidate during the build; no prerelease was adopted. See the validation report for tooling audit limitations.

## Research workflow

1. **Identify:** search for the provider, resolve identity from actual result origins, and reject ambiguous identities. A pasted URL is a hint, not proof of ownership.
2. **OAuth:** search and fetch official-domain capability documentation.
3. **Setup + Composio:** retrieve registration, scopes and redirects, then check Composio documentation.
4. **Distribution:** search official review, publishing and approval material.
5. **Reconcile + synthesize:** supply retrieved text to OpenAI Responses structured output. Missing facts remain unknown; conflicting or incomplete material must be disclosed.
6. **Validate:** Zod enforces fields and enums; citations must reference actual retrieved sources; verified claims require official evidence; step destinations must be retrieved URLs.
7. **Save:** transactionally persist the guide and evidence, then navigate to `/providers/[slug]`.

The browser polls read-only status and sends one POST per backend stage. State, gathered evidence and a short execution lease are stored between requests, so a tab reload resumes the session and two tabs do not run the same stage concurrently. This avoids an in-memory queue or unreliable fire-and-forget serverless work. **Closing every research tab pauses execution**; reopening its URL resumes it. Sessions expire after 30 minutes; a crashed stage lease expires after 150 seconds.

Limits per job: **4 searches**, at most **9 provider pages + 2 Composio pages**, 12-second fetch inactivity timeout, a 20-second absolute deadline per page, four-second DNS bound, three redirects per document, 1 MB response cap, 14,000 readable characters per page, 60-second LLM request timeout, one SDK retry and 9,000 synthesis output tokens. Identification has a separate 900-token limit. A failed stage ends the job without showing it as complete. Explicit retry starts a new job; active duplicates are reused.

```text
GET  /api/providers?q=gmail&category=Email
POST /api/research                       { query, useCase?, accessCode? }
GET  /api/research/[jobId]                saved public job status
POST /api/research/[jobId]               execute the next bounded stage
```

Error responses use `{ "error": { "message": "..." } }`. Missing keys create an honestly failed persisted job; saved guides still work. No simulated research is exposed as a production feature.

## Verification and tests

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
# With the application running and real keys configured:
npm run research:live
```

The integration tests mock search and LLM boundaries while exercising all seven real engine stages, validation, and a separate temporary SQLite database. Browser tests cover ten providers, three featured cards, aliases, keyboard search, filters, checkbox persistence, launch states, sharing, unfamiliar-provider research, errors, generated-fixture persistence and mobile layouts. The generated fixture is explicitly labeled as a test and deleted afterward.

See [validation results](docs/validation.md) and the [official-source research audit](docs/research-audit.md). **A genuine research request was attempted but could not run retrieval or synthesis because OpenAI and Tavily credentials were absent. Mocked success is not a successful live research run.**

Additional screenshots: [desktop guide](docs/screenshots/guide-desktop.png), [mobile homepage](docs/screenshots/home-mobile.png), [mobile guide](docs/screenshots/guide-mobile.png).

## Production deployment

Use Vercel or a Node.js host with a **durable hosted PostgreSQL database**. Do not deploy local SQLite to an ephemeral serverless filesystem.

1. Provision an existing managed PostgreSQL database and configure `DATABASE_URL` in the deployment environment. Use a pooled URL where your database host recommends it. No database is created or purchased by this app.
2. Configure the research keys, exact `NEXT_PUBLIC_APP_URL`, optional repository link, and optional research access code.
3. Run `npm ci`, then `npm run db:production` and `npm run db:seed` against that database from a trusted deployment environment.
4. Run `npm run build`. The database helper automatically selects `schema.postgres.prisma` for a PostgreSQL URL, including during client generation. The standard Next.js build works on Vercel; `vercel.json` sets the research function duration to 180 seconds. Your hosting plan must support that duration.
5. Start with `npm start` on a Node host, or let Vercel serve the Next.js deployment. Test a saved guide and run `npm run research:live` against the deployed origin with configured keys.

For a production install, `db:production` uses Prisma `db push` without destructive acceptance flags. For an evolved product, replace this POC schema synchronization with reviewed PostgreSQL migrations (`prisma migrate dev --schema prisma/schema.postgres.prisma` in development and `prisma migrate deploy --schema prisma/schema.postgres.prisma` during release). Keep both schema models aligned; only datasource provider differs. Export and import local generated records deliberately if needed; the seed script populates the initial library in either database.

No live deployment URL is claimed. Hosting credentials and a hosted database were not available during this build.

## Security and limits

- Server-side API keys; no collection of provider passwords, client secrets or access tokens.
- HTTPS-only retrieval; unsafe schemes, credentials in URLs, private/reserved IPs, internal hosts and nonstandard ports are blocked.
- DNS is resolved before each fetch, checked, then **pinned to the HTTPS connection**. Each redirect is validated and resolved again. No retrieved scripts execute.
- Source material and user input are untrusted data, explicitly separated from synthesis instructions.
- Persisted quota: five requests per caller per hour and thirty globally per day. The global cap also bounds abuse through spoofed caller identifiers. Configure a deployment access code and provider spending limits for a public demo.
- Provider identity and source authority remain AI-assisted in unfamiliar-provider research. Domain matching is conservative, not domain ownership verification. Structural citations do not prove semantic truth. Several seed guides remain explicitly partial.
- No automatic provider registration, compliance submission, approval tracking, OAuth token issuing, account system, billing or enterprise infrastructure.
- Browser-only progress does not sync across teammates. Shareable guide content does.
