CREATE TABLE "project_contact_states" (
  "projectId" TEXT PRIMARY KEY REFERENCES "projects"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'unrecorded',
  "note" TEXT NOT NULL DEFAULT '',
  "nextContactAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("status" IN ('unrecorded','quote_sent','called','waiting','confirmed','on_hold','closed'))
);
CREATE TABLE "project_contact_logs" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "nextContactAt" TIMESTAMP(3),
  "recordedBy" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("status" IN ('unrecorded','quote_sent','called','waiting','confirmed','on_hold','closed'))
);
CREATE INDEX "project_contact_logs_projectId_recordedAt_idx" ON "project_contact_logs"("projectId", "recordedAt");
ALTER TABLE "project_contact_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_contact_logs" ENABLE ROW LEVEL SECURITY;
