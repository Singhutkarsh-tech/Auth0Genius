# Deploy Auth0Genius with Supabase and Vercel

Supabase hosts the PostgreSQL database; Vercel runs the Next.js application and its research API. No Supabase Auth, Storage, browser database client, or Supabase API key is required by this application.

This is a deployment procedure, not a record of a completed hosted deployment. The local application and real research result have been validated; hosted PostgreSQL and Vercel still need the checks below.

## 1. Create the Supabase database

Create a Supabase project and save its database password in your password manager. In **Connect**, obtain both connection strings:

| Use                               | Connection                                                                  |
| --------------------------------- | --------------------------------------------------------------------------- |
| One-time schema setup and seeding | Session pooler, port **5432**, or a reachable direct PostgreSQL connection. |
| Vercel application runtime        | Transaction pooler, port **6543**.                                          |

Use the exact host and username from your project. Insert the database password, URL-encoding any special characters. For this repository's Prisma 6 client, append `pgbouncer=true` to the transaction connection; start with `connection_limit=1` for serverless instances and require SSL. Preserve existing query parameters when adding these options.

Example shapes only — replace the placeholders using your project's Connect panel:

```dotenv
# One-time setup connection:
DATABASE_URL="postgresql://<db-user>.<project-ref>:<encoded-password>@<pooler-host>:5432/postgres?sslmode=require"

# Vercel runtime connection (configure separately in Vercel):
DATABASE_URL="postgresql://<db-user>.<project-ref>:<encoded-password>@<pooler-host>:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
```

The app uses server-side Prisma directly. If this is a dedicated database and you do not use Supabase's Data API, turn the Data API off in Supabase API Settings rather than exposing the application tables through it. For a dedicated Prisma database role, follow Supabase's role setup instructions.

References: [Supabase Prisma setup](https://supabase.com/docs/guides/database/prisma), [connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres), and [Prisma connection troubleshooting](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting).

## 2. Initialize the production database once

Use a **separate checkout** for this step. Prisma generates a provider-specific client, so keeping production setup separate avoids changing the client used by your running SQLite preview.

```sh
git clone https://github.com/Singhutkarsh-tech/Auth0Genius.git Auth0Genius-production
cd Auth0Genius-production
npm ci
```

Create an ignored `.env.production.local` file containing `DATABASE_URL` with the **session/direct setup connection**, not the transaction connection. Keep the password out of shell history and commits.

```sh
node --env-file=.env.production.local scripts/prepare-db.mjs production
node --env-file=.env.production.local --import tsx prisma/seed.ts
```

The first command selects `prisma/schema.postgres.prisma`, creates the tables, and generates the PostgreSQL client. The second inserts the ten seeds without duplicating their versions. Confirm that `Provider` has ten rows, with Gmail, Slack, and GitHub featured, and that `Guide` and `EvidenceSource` contain records.

The current schema uses `DATABASE_URL`; a `DIRECT_URL` variable alone is not read by this repository. Setup and Vercel intentionally receive different `DATABASE_URL` values.

`db:production` currently uses Prisma `db push` without destructive acceptance flags. For subsequent production schema changes, introduce reviewed migration files and use `prisma migrate deploy`; do not apply destructive schema changes automatically during every Vercel build.

The local Airtable result is in an ignored SQLite review database. It is not copied by seeding and will not appear in Supabase unless deliberately migrated. You can instead create a fresh research result on the deployed application.

## 3. Import the GitHub repository into Vercel

In Vercel, choose **Add New → Project**, import `Singhutkarsh-tech/Auth0Genius`, and select `main` as the production branch.

| Setting          | Value                                            |
| ---------------- | ------------------------------------------------ |
| Framework        | Next.js                                          |
| Root directory   | Repository root (`.`)                            |
| Node.js          | 24.x, matching the validated local major version |
| Install command  | `npm ci`                                         |
| Build command    | `npm run build`                                  |
| Output directory | Next.js default                                  |

The build generates the PostgreSQL Prisma client when `DATABASE_URL` starts with `postgres://` or `postgresql://`. Do not add schema synchronization or seeding to the normal build command; complete step 2 first.

Reference: [Vercel Git deployments](https://vercel.com/docs/git).

## 4. Configure Vercel environment variables

Set these for **Production** before deployment:

| Variable                 | Value                                                           |
| ------------------------ | --------------------------------------------------------------- |
| `DATABASE_URL`           | Supabase transaction-pooler URL from step 1.                    |
| `OPENAI_API_KEY`         | Your configured OpenAI key, server-side.                        |
| `TAVILY_API_KEY`         | Your configured Tavily key, server-side.                        |
| `NEXT_PUBLIC_APP_URL`    | Your actual production HTTPS origin, without a trailing slash.  |
| `RESEARCH_ACCESS_CODE`   | A shared code for public-demo research access and cost control. |
| `RESEARCH_PUBLIC_ACCESS` | Optional `true` for a passwordless evaluator demo. Applies strict persistent caps of 10 research starts/day globally and 2/IP/day. |
| `NEXT_PUBLIC_GITHUB_URL` | Optional: `https://github.com/Singhutkarsh-tech/Auth0Genius`.   |
| `OPENAI_MODEL`           | Optional; leave unset to use the app's default.                 |

Keep the database URL and research keys server-only; do not prefix them with `NEXT_PUBLIC_`. This application does not need `NEXT_PUBLIC_SUPABASE_URL`, an anon key, or a Supabase service-role key.

For a public take-home demo, set `RESEARCH_PUBLIC_ACCESS=true` so evaluators do not need a private code. The database quota limits public starts to 10/day across the project and 2/day per IP. Leave it `false` for a private demo and require `RESEARCH_ACCESS_CODE`. The global cap is the hard paid-research ceiling; disable public access after evaluation.

If the production origin is assigned by the first deployment, set `NEXT_PUBLIC_APP_URL` to that exact origin afterward and redeploy. Environment changes apply through a new deployment. Use a separate database for Preview deployments, or leave production credentials scoped only to Production.

The research route exports a **180-second** maximum duration, also reflected in `vercel.json`. Ensure the selected Vercel function settings support it; Fluid Compute duration limits are documented by Vercel. No background worker needs to be deployed.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [function duration](https://vercel.com/docs/functions/configuring-functions/duration).

## 5. Deploy and verify persistence

Deploy the project, then check:

1. The homepage shows the ten seeds and exactly three featured providers.
2. Gmail, Slack, and GitHub open; managed/custom switching changes their checklists and progress.
3. Submit a provider absent from the saved library, using the research access code if configured. Observe actual stages and sources; leave a research tab open to drive stage advancement.
4. Confirm that the job completes or returns an honest partial/error state. Unknown facts must stay unknown.
5. Open the saved guide in an incognito window. Confirm new `Provider`, `Guide`, `EvidenceSource`, and `ResearchJob` records in Supabase.
6. Redeploy the same commit and reopen that saved URL. The guide must survive the deployment.
7. Inspect Vercel logs for database, search, LLM, and timeout failures. Check that no secrets are logged.

A page displaying fallback seeds does not prove that the database is connected. New-guide persistence and the redeployment check are the important acceptance tests.

For command-line evidence, point `NEXT_PUBLIC_APP_URL` at the deployed origin and run `npm run research:live -- "Unfamiliar provider" --report docs/live-research-production.json` from a trusted environment with the research access code configured. Cached reuse is not fresh generation.

Record the actual deployed URL and hosted validation results in `docs/validation.md` after these checks pass.
