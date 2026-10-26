# Validation report

The original-build and P1 checkpoint results below are historical snapshots. The current stabilization and direct-URL results are recorded in the final section.

The original-build results below describe audited commit `374cd9c`. They are historical. Current remediation results and acceptance limits are recorded in the final P1 section.

Build date: **20 October 2026**. Environment: macOS arm64, Node.js 24.12.0, Next.js 16.4.2, Prisma 6.19.3, local SQLite.

## Automated checks

| Check                                   | Result                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript (`npm run typecheck`) | Passed                                                                                                                                                        |
| ESLint (`npm run lint`)                 | Passed with no warnings                                                                                                                                       |
| Vitest (`npm test`)                     | **61 tests passed**; provider normalization, schema/citations, route state, decisions, SSRF safety, and mocked end-to-end engine with real SQLite persistence |
| Playwright (`npm run test:e2e`)         | 11 smoke tests passed on Chromium, including desktop and 390px mobile layout                                                                                  |
| Production build (`npm run build`)      | Passed; all App Router pages and API routes compiled; `npm start -- --port 3100` served the built app                                                         |
| Safe repeat seeding                     | Passed repeatedly; ten providers, three featured, no duplicate versions                                                                                       |
| Production dependency audit             | See dependency notes below                                                                                                                                    |
| PostgreSQL deployment                   | Schema and automatic database selection provided; no hosted PostgreSQL instance available for a live deployment test                                          |

Browser tests verify the homepage, all ten initial providers, correct featured providers, alias/domain matching, keyboard shortcut, meaningful directory filtering, guide navigation, checklist persistence after reload, derived next action, blocked launch stage, clipboard URL, explicit unfamiliar-provider action, honest research errors, a saved generated fixture URL after reload, mobile navigation, and no horizontal overflow at 390px.

The browser’s generated guide is a **deterministic test fixture**, saved through the real Prisma repository and removed afterward. It is not live AI research. Pipeline integration tests mock search and LLM boundaries, execute all backend stages, validate output, and use an isolated temporary database. They also cover retrieval failures, invalid synthesis, execution leases, duplicate reuse and persistent quotas.

## Historical original-build live attempt

Ran `npm run research:live` against the locally running application, submitting **Airtable** to the real `/api/research` endpoint.

Result:

```json
{
  "status": "failed",
  "stage": 0,
  "error": "Live research is not configured. Add OPENAI_API_KEY and TAVILY_API_KEY on the server to enable retrieval and guide synthesis. Saved guides remain available.",
  "outputUrl": null
}
```

At the audited commit, neither key was configured. No search or LLM invocation occurred, no research stage was marked completed, and no guide was fabricated. At that time, **a successful genuine live research run had not been verified**; current successful partial-result validation is below. Configure both keys, restart the app, and rerun this command to exercise the real retrieval and OpenAI path.

Official seed documentation was separately accessed through browsing tools during the build; that is recorded in [research-audit.md](research-audit.md). This is not a substitute for a successful live agent run.

## Historical original-build direct retrieval check

Ran `node --import tsx scripts/retrieval-smoke.ts` against GitHub and Slack official documentation with the actual DNS-pinned HTTPS implementation. Both succeeded: GitHub returned 2,114 readable characters; Slack returned the configured 14,000-character maximum. This uncovered and corrected Node’s `lookup` callback behavior when `all: true`; a regression assertion covers that callback. This validates real retrieval, not Tavily search or OpenAI synthesis.

## Dependency and deployment notes

The production build and tests use a locked dependency tree. The initial dependency audit found a deepmerge stack-exhaustion advisory through Prisma tooling. A patched `deepmerge-ts` 8 override was applied and database generation/seeding and the build were rechecked. The final `npm audit --omit=dev` reports **zero vulnerabilities**. The full tooling tree retains **five high-severity advisory entries** in the Next.js ESLint glob chain.

A separate development-tooling audit reports the unpatched `braces` stack-exhaustion advisory through the Next.js ESLint plugin’s glob dependencies. These are build/lint tools, not document-fetching or guide-serving code. Automatic audit suggestions downgrade the Next.js ESLint config to a previous major, so that incompatible change was not applied. Review updated upstream tooling before expanding this proof of concept into a maintained service.

At the original build, no API credentials, account sessions, hosted database or Vercel CLI connection were available. The remediation below subsequently used locally configured API credentials. A durable production database and deployment environment are still required. The local server and SQLite database are for development; they are not a serverless persistence strategy.

## Visual checks

Desktop and mobile screenshots are saved in `docs/screenshots/`. Layouts were visually inspected, real provider marks were confirmed, guide text contrast was strengthened, and responsive browser tests assert that the main screens fit the viewport. Reduced-motion handling is present. This was not a complete assistive-technology audit.

## P1 remediation — current validation

Scope: preserve the modular monolith, ten seeds, three featured providers, A0G/Auth0Genius visual design, and user data. No accounts, billing, vault or separate worker service were added. User-configured research credentials were used only server-side, then moved into ignored `.env`; empty key placeholders were restored in `.env.example`. No key values were printed or committed. Test writes use isolated databases.

### Implementation

- **Evidence (audit F2):** classifications bind to explicit claims, conclusions, authority and topic. Verified labels require reviewed semantic support bound to the exact claim text. Retained passages must exist in source capture material. Official-source presence elsewhere in the guide is insufficient. Live model output cannot mark itself reviewed: unresolved interpretations remain unverified; summary classifications become unknown/partial, unreviewed header claims are replaced with a partial-research description, and setup recommendations become verification-first. Seed citation helpers default to unverified. Relevant per-step instruction links and conditional callback rendering were corrected alongside these checks.
- **Recovery (audit F4):** GET returns execution claimability, lease expiry and retry delay; POST returns its actual claim outcome. A cancellable, bounded browser loop survives unchanged state, transport errors and multiple tabs. Lease fencing blocks stale completion. Guide/evidence publication and job completion share a transaction, using a stable publication ID. A real SQLite trigger test interrupts completion after the guide write and proves rollback and one-publication retry.
- **Routes (audit F3):** managed/custom steps, denominators, recommendations, prerequisites, readiness and launch stages derive from the selected route. Managed Gmail/Slack/GitHub have five applicable steps; unknown availability leads to a check first. Route-specific completion/blockers persist per provider/version. Legacy progress migrates to custom only. Missing stages are not researched; exemptions require explicit reviewed evidence. Selected controls expose `aria-pressed`.
- **Fresh live acceptance (audit F1):** the smoke script accepts a provider input, treats saved-guide or active-job reuse as reuse (exit 2), and records safe stages, actual discovery/fetch URLs, output and claim evidence. Technical generation does not establish semantic correctness. Fresh-context/restart verification is recorded below only when actually performed.

### Deterministic checks

Current run: **100 tests passed** across eight Vitest files; type checking and ESLint passed without warnings; production build passed. **19 browser tests passed** in development and **19 passed** against the production build, using separate temporary SQLite databases and matching server URLs. Coverage includes Gmail/Slack/GitHub route switching/reload, unknown managed availability, legacy local progress, two-tab abandoned-lease recovery, terminal behavior, transient POST retry, and a live-shaped s/c-source fixture. Fixtures and mocks are not live acceptance.

The audit’s nonexistent-file bootstrap probe did **not** fail in this remediation environment: original Prisma setup created the missing file successfully (exit 0). The delivered setup nevertheless uses OS temporary directories and explicitly creates an empty database file, reports setup diagnostics, and cleans up only its owned directory. `npm test` was run against the actual repository changes, without external test patches.

### Real research attempts

1. A credentialed fresh **Airtable** request reached search and identity inference, then failed at stage 0 because the model-supplied homepage origin was absent from search results. See `live-research-p1-attempt-1.json`.
2. A second fresh Airtable request retained its discovery URLs and failed at the same gate: search returned an official support subdomain among third-party pages, while the model supplied a different root origin. See `live-research-p1-attempt-2.json`.
3. The third fresh Airtable attempt completed actual retrieval but failed synthesis because the OpenAI wire schema rejected the JSON Schema `uri` format. Its discovery also exposed unrelated domain candidates. See `live-research-p1-attempt-3.json`.
4. The fourth fresh attempt used constrained candidate discovery and domain-filtered search, then failed closed when a model quotation was not retained in the actual fetched text. See `live-research-p1-attempt-4.json`.
5. The fifth fresh request **completed**, using real Tavily retrieval and OpenAI `gpt-4.1-mini` structured synthesis. It was not a saved-guide reuse or a seed fixture. Job `cmvgd7tti0000y6gl83ippdiy` completed stages 0–6, reaching terminal stage 7. Guide `research-cmvgd7tti0000y6gl83ippdiy` was persisted at **http://localhost:3185/providers/airtable**, generated at `2026-10-20T07:32:45.286Z`. See `live-research-p1.json`.

Identity discovery was corrected to search for the provider’s official website and select an indexed observed candidate. It no longer accepts a homepage invented outside the candidate list. The failed attempts are preserved and are not called successful generation. The model-facing schema omits unsupported URI-format metadata while server Zod validation retains HTTPS URL requirements. Unmatched or irrelevant passage bindings are discarded and disclosed, never turned into verified citations; unknown source IDs still reject output. Community-authored material has third-party authority even on a provider subdomain. The latest attempt is in `live-research-p1.json`.

**Live technical acceptance: passed for a conservative partial result.** Eight source captures retain actual fetched text, original/final URLs and matching SHA-256 hashes. This proves search, retrieval, structured synthesis, validation and persistence. It does **not** establish a fully reviewed provider guide. All three material summary classifications remain unknown, unsupported quotes were removed, and the custom route offers evidence review before registration. No real provider console setup or OAuth connection was attempted.

The application was stopped and restarted against the preserved isolated SQLite database. A new Chromium context opened the completed research page and navigated to the saved guide. Another fresh context opened the saved URL independently. Desktop/custom-route and 390px mobile checks passed with no page errors; source hashes and all completed stages were checked again. Evidence: `live-research-p1-restart.json`, `screenshots/p1-airtable-desktop.png`, `screenshots/p1-airtable-mobile.png`. This is an actual live guide, separate from browser fixtures.

A repeat real smoke command returned **exit 2**, `outcome: reused`, `fresh: false`, and zero research stages. It was correctly excluded from fresh generation success; see `live-research-p1-reuse.json`.

The material-claim audit in [research-audit.md](research-audit.md) distinguishes provider OAuth support, the Composio Airtable listing, scope selection, and the unrelated Salesforce approval route. Approval requirements and timing remain unresolved. The generated guide remains partial; the POC deliberately does not auto-promote model interpretations after exact citation checks.

### Local review and configuration

Both `OPENAI_API_KEY` and `TAVILY_API_KEY` were configured for the successful run. No research variable is currently missing locally. The ignored `prisma/p1-validation.db` preserves the actual isolated result; the original development database was not modified. Ten seeded providers and exactly three featured entries remain intact, with Airtable added only in this review database.

The local production preview is at **http://localhost:3185**. To restart the same preview:

```sh
DATABASE_URL=file:./p1-validation.db NEXT_PUBLIC_APP_URL=http://localhost:3185 npm start -- --port 3185
```

Normal `npm run dev` continues to use the original database configured in `.env`. For deployment, provision server environment variables independently; local ignored files and this review database are not published.

### Remaining deployment limits

Hosted PostgreSQL durability and a deployed origin have not been tested. Production requires hosted storage, environment/secret provisioning, independent semantic review of new provider facts, and a deployment/restart durability check. The existing five development-tooling audit findings remain a separately documented limitation. Local SQLite and browser fixture success do not establish hosted durability.

## Direct URL identity acceptance — 20 October 2026

The search and research entry accepts provider names, bare domains, and HTTPS URLs. It rejects unsafe schemes, credentials, localhost/private IPs, and unsupported formats through the same URL validator used by remote retrieval. The research job retains the supplied URL, fetches that page through the DNS-pinned redirect-safe fetcher, constrains provider discovery to the corresponding normalized domain, and presents the resolved provider name/domain in the workspace. It returns a saved guide when that guide's official domain matches, including an evidenced developer subdomain. Unresolved identities pause for confirmation instead of switching to another search result.

Parser regressions include `Figma`, `figma.com`, `https://www.figma.com`, `https://developers.figma.com`, and `https://kite.trade`; domain tests include www/developer subdomains and common multi-label public suffixes. Existing regressions cover Figma versus `figma.jp`, Zerodha/Kite Connect, a fabricated name, and unrelated companies sharing one name. The browser suite now includes a deterministic direct-Figma URL flow that checks the submitted URL is preserved and the resolved `Figma design platform` / `https://figma.com` identity is shown without a `figma.jp` substitution. This browser mock does not claim live retrieval or generation.

| Current check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; generated `.next-*` directories are excluded |
| `npm test` | 132 passed across 9 files |
| Browser suite | 21 passed against an isolated local SQLite database after the verification-first next-action guard, including desktop/mobile, direct URL, route switching, and recovery checks |
| Production build | Passed with `NEXT_DIST_DIR=.next-stabilization-final npm run build` (Webpack) |
| Turbopack production build | The sandbox denied its CSS worker bind (`listen EPERM`); the default build script now uses Webpack, which completed successfully |
| Fresh direct-URL live research | Passed for Figma; 11 actual fetched sources, all stages 0–6 completed, guide persisted, then verified after server restart |

### Fresh Figma URL run

Input: `https://www.figma.com`. This was a **fresh generation**, not cached guide reuse or a fixture. It resolved to `Figma`, canonical domain `https://figma.com`; fetched both the supplied Figma website and `developers.figma.com`; and did not select `figma.jp`. Actual provider developer sources included the REST API overview, OAuth app registration and scope documentation. The run completed search, retrieval, structured synthesis, evidence validation, and atomic publication (stages 0–6). The guide was saved at `http://127.0.0.1:3183/providers/figma` in an isolated temporary SQLite database.

The supported OAuth classification has retained provider evidence whose text explicitly identifies OAuth 2.0. Composio managed availability and approval remain **unknown**; the model's interpretations were kept unverified. This is a useful partial guide, not a claim that the OAuth registration or provider review path was independently certified. The full safe stage/source report is [live-research-direct-figma.json](live-research-direct-figma.json); a second submission returned `reused`, `fresh: false`, zero stages, and the same guide URL in [live-research-direct-figma-reuse.json](live-research-direct-figma-reuse.json).

After stopping and restarting the production build against the same isolated SQLite file, the verification script opened the saved research URL and guide in fresh browser contexts. It confirmed job completion, the persisted `Figma` guide, retained fetched-source hashes, no page errors, and a mobile viewport without horizontal overflow. Evidence: [live-research-direct-figma-verify.json](live-research-direct-figma-verify.json) and the Figma desktop/mobile captures in `docs/screenshots/`.

The live run exposed and fixed three defects before its successful retry: the initial Figma homepage exceeded the fetch cap (retrieval now keeps a bounded, explicitly truncated prefix); the CLI smoke script treated identity-blocked jobs as endlessly active (it now reports `blocked` and exits); and an unsupported model-generated step URL failed publication (the link is removed and the missing destination is surfaced as unresolved). Earlier failed attempts are not counted as success.

Visual review of the generated guide also showed an unverified setup step being presented as the next action. The recommendation now links to source evidence until that step is verified, with unit and browser regression coverage.

The local seed library remains at ten providers and three featured integrations. Figma was generated only in the temporary validation database and was not added as an eleventh seed. The current production deployment was not changed.

## Release requirement matrix

| Requirement | Status | Evidence / remaining condition |
| --- | --- | --- |
| Provider identity and direct URLs | **Passed locally** | Name/domain/URL parsing, safe retrieval, exact domain continuity, ambiguity confirmation, saved-guide reuse, and a fresh Figma URL generation are tested. |
| OAuth mechanism classification | **Passed with conservative limit** | Figma was classified OAuth 2.0 from retained official text. Zerodha/Kite remains `oauth_like_proprietary`; model interpretation alone cannot promote a protocol. |
| Evidence quality | **Passed as partial research** | Official vs third-party authority is distinct; unresolved managed auth, approval, timing, and guide steps stay unknown/unverified. This POC has no human-review CMS. |
| Publication and persistence | **Passed locally** | Existing Prisma transaction/idempotency tests plus a real Figma guide persisted, survived an application restart, and opened in fresh browser contexts. |
| Research execution and recovery | **Passed in tests** | Bounded stage leases/retries, terminal and blocked handling, safe error responses, publication fencing, and CLI blocked-state exit are covered. |
| Guide recommendation and visual usability | **Passed locally** | Unverified setup steps send the next action to evidence; desktop and 390px mobile browser checks pass. |
| Demo access and spend limits | **Implemented; production setting not checked here** | `RESEARCH_PUBLIC_ACCESS=true` removes the hidden-code prompt while persistent limits remain 10 starts/day globally and 2/IP/day. Confirm this Vercel Production setting before sharing the public demo, or share the configured access code with evaluators. |
| Supabase/Vercel release | **Pending** | No production code or environment change was made in this pass. Apply/migrate the schema for `retryCount`, deploy this commit, and verify a guide remains after a production restart before calling hosted durability accepted. |

## Production recovery — 26 October 2026

The earlier “Supabase/Vercel release pending” status above is a historical checkpoint and is superseded by this production follow-up. At approximately 15:18 local time, the deployed research form returned “Research storage is unavailable.” Supabase PostgreSQL logs identified SQLSTATE `42703`: `column ResearchJob.retryCount does not exist`. The application’s generated Prisma client and schema expected the field, but the hosted table had not been synchronized. This was a database schema drift issue, not a Steam-specific research failure.

Applied the additive, idempotent repair recorded in [20261026_add_researchjob_retry_count.sql](../prisma/manual-migrations/20261026_add_researchjob_retry_count.sql): add `retryCount INTEGER NOT NULL DEFAULT 0` if absent. Supabase reported success, and the `ResearchJob` table showed the new `int4` column with existing rows set to `0`. No existing rows were deleted. The Vercel build does not apply Prisma schema changes, so future schema edits must be deliberately applied before shipping code that relies on them; see [deployment instructions](deployment.md).

### Fresh production research

After the repair, submitted **Steam** through the deployed research experience. This was a fresh job, not a cached guide, seed, mocked response, or local fixture. Production job `cmvp7t2350000l1074t2qba0z` completed stages 0–6 (terminal stage 7), retrieved 10 sources, and saved a shareable guide. A subsequent production API read returned the completed job, and the guide opened at [https://auth0-genius.vercel.app/providers/steam](https://auth0-genius.vercel.app/providers/steam). Safe run evidence, including sources, is in [live-research-steam-production.json](live-research-steam-production.json).

The result resolved Steam to **Valve Corporation** at `store.steampowered.com`, but it is correctly marked **partial**. Retrieved Steam pages identified Valve/Steam but did not establish that Steam exposes an OAuth flow for the intended integration, nor app registration, scopes, or approval. Composio sources explained managed/custom authentication but did not confirm Steam managed-auth availability. OAuth support, mechanism, managed auth, approval, and timing remain unknown/unverified. The guide therefore recommends verifying OAuth support and contains no fabricated OAuth registration instructions. The ten-source count and completed technical pipeline demonstrate retrieval and persistence, not semantic support for each OAuth claim. Persistence across a later production deployment remains to be checked.

### Release status update

| Requirement | Current status | Evidence / limit |
| --- | --- | --- |
| Production database schema | **Recovered** | `ResearchJob.retryCount` added and confirmed in Supabase after the logged `42703` failure. |
| Fresh unfamiliar-provider production run | **Passed technically; partial guide** | Steam research completed with 10 fetched sources and a saved URL; OAuth itself was not verified. |
| Production guide persistence | **Passed for current deployment** | Completed job read back through production API and guide opened from stable URL. Persistence through a subsequent deployment is still unverified. |
| User-facing error root cause | **Identified** | Research creation caught the missing-column database exception and returned the generic storage-unavailable message. |
| Remaining release check | **Open** | Redeploy after the next repository release, then reopen the Steam URL and confirm it remains available. |

## Zerodha/Kite Connect correction — 26 October 2026

The historical protocol regression note above is now reflected in the actual guide pipeline. Tavily discovery is supplemented with bounded official Kite Connect documentation references for both the Zerodha homepage and `kite.trade`. All references are fetched through the SSRF-safe retrieval path; only the resulting official fetched text can establish a provider claim. The structured synthesis prompt distinguishes an OAuth-style proprietary handshake from standard OAuth 2.0 and keeps compliance requirements use-case-specific.

When the official Kite user, agent setup, and API overview text are present, deterministic reconciliation builds a Kite Connect checklist from retained passages: create the provider app and redirect URL; receive the `request_token`; exchange it with the provider-specific checksum on the server; then test API requests. It keeps Composio compatibility, managed auth, and provider approval unknown. It also separates conditional trading compliance from OAuth app approval. Without the expected official evidence, this targeted playbook does not activate and the generic partial/unknown guard remains.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with no warnings |
| `npm test` | **135 passed** across 9 files |
| `npm run build` | Passed; all App Router routes compiled |
| Fresh local Zerodha live research | Passed: fresh job `cmvp9wtvn0000y6ou23xwciek`, stages 0–6 completed, 10 sources retained, guide saved at `http://127.0.0.1:3183/providers/zerodha`; no Zerodha account credentials used |
| Guide output | OAuth-style support documented; mechanism `oauth_like_proprietary`; Composio availability and approval unknown; provider-specific checklist present; no account connection attempted |
| Browser smoke suite | **19 passed, 2 failed**. Existing failures: Google Mail alias submit did not navigate to Gmail; abandoned-lease error-banner assertion did not render the expected key name. The direct Figma, mobile, route switching, guide/share, and other research regressions passed. |
| Local browser guide review | Passed on a freshly opened Chrome tab against the built app. The guide shows the OAuth-like proprietary mechanism, an unknown managed-auth status, unknown approval/timing, and an explicit Composio compatibility blocker. Managed route shows 1 availability-check step; switching to custom shows 7 route-specific steps, including Verify and Launch. All seven are user-reported; nothing is marked complete automatically. |
| Production deployment | Ready for commit `6fae9c3` on Vercel; custom domain `https://auth0-genius.vercel.app` was opened after deploy. |
| Fresh production Zerodha research | **Not completed.** Submitted one fresh request with a portfolio-dashboard use case after deploy. The public per-IP quota rejected it before a research job was created (`Research limit reached`); no provider retrieval or paid synthesis ran. I did not bypass the limit. The currently saved production `/providers/zerodha` guide remains the older partial guide. Try again after the quota window resets, or use the documented private research access configuration if the owner enables it. |
