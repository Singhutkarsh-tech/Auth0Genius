-- Production repair applied to the Auth0Genius Supabase database on 2026-10-26.
-- The deployed Prisma client expected this field, while the ResearchJob table
-- had not yet received it. This additive, idempotent update preserves all rows.
ALTER TABLE public."ResearchJob"
ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;
