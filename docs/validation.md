# Validation report

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
