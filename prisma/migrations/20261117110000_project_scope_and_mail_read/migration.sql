ALTER TABLE "inbox_mail" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "projects"
  ADD COLUMN "workScope" TEXT,
  ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN "eventDate" TEXT,
  ADD COLUMN "workspaceVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_eventType_check" CHECK ("eventType" IN ('general', 'event', 'performance')),
  ADD CONSTRAINT "projects_workspaceVersion_check" CHECK ("workspaceVersion" >= 0);
-- No dates, work scopes, read receipts or tasks are invented for existing records.
