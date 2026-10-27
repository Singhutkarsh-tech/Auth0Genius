-- Additive PostgreSQL migration. Apply before deploying this release.
CREATE TABLE IF NOT EXISTS "PublicDocument" (
  "url" TEXT PRIMARY KEY,
  "capture" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
