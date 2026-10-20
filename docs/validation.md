# Validation report

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

## Actual live research attempt

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

Neither key was configured. No search or LLM invocation occurred, no research stage was marked completed, and no guide was fabricated. Thus **a successful genuine live research run has not been verified**. Configure both keys, restart the app, and rerun this command to exercise the real retrieval and OpenAI path.

Official seed documentation was separately accessed through browsing tools during the build; that is recorded in [research-audit.md](research-audit.md). This is not a substitute for a successful live agent run.

## Direct live retrieval check

Ran `node --import tsx scripts/retrieval-smoke.ts` against GitHub and Slack official documentation with the actual DNS-pinned HTTPS implementation. Both succeeded: GitHub returned 2,114 readable characters; Slack returned the configured 14,000-character maximum. This uncovered and corrected Node’s `lookup` callback behavior when `all: true`; a regression assertion covers that callback. This validates real retrieval, not Tavily search or OpenAI synthesis.

## Dependency and deployment notes

The production build and tests use a locked dependency tree. The initial dependency audit found a deepmerge stack-exhaustion advisory through Prisma tooling. A patched `deepmerge-ts` 8 override was applied and database generation/seeding and the build were rechecked. The final `npm audit --omit=dev` reports **zero vulnerabilities**. The full tooling tree retains **five high-severity advisory entries** in the Next.js ESLint glob chain.

A separate development-tooling audit reports the unpatched `braces` stack-exhaustion advisory through the Next.js ESLint plugin’s glob dependencies. These are build/lint tools, not document-fetching or guide-serving code. Automatic audit suggestions downgrade the Next.js ESLint config to a previous major, so that incompatible change was not applied. Review updated upstream tooling before expanding this proof of concept into a maintained service.

No API credentials, account sessions, hosted database or Vercel CLI connection were available. A durable production database and deployment environment are still required. The local server and SQLite database are for development; they are not a serverless persistence strategy.

## Visual checks

Desktop and mobile screenshots are saved in `docs/screenshots/`. Layouts were visually inspected, real provider marks were confirmed, guide text contrast was strengthened, and responsive browser tests assert that the main screens fit the viewport. Reduced-motion handling is present. This was not a complete assistive-technology audit.
