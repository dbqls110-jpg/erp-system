-- Separate user-visible assistant turns from internal evaluation/fixture jobs.
ALTER TABLE "agent_jobs" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'user';

CREATE INDEX IF NOT EXISTS "agent_jobs_userId_visibility_createdAt_idx"
  ON "agent_jobs"("userId", "visibility", "createdAt");

DROP INDEX IF EXISTS "agent_jobs_userId_createdAt_idx";
