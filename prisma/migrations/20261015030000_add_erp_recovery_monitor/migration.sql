CREATE TABLE "project_upload_recoveries" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "contentSha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'uploading' CHECK ("status" IN ('uploading','pending','completed','needs_attention')),
  "driveFileId" TEXT, "driveUrl" TEXT, "category" TEXT, "fileId" TEXT,
  "applyQuote" BOOLEAN NOT NULL DEFAULT false, "quoteRevenue" DOUBLE PRECISION, "quoteCost" DOUBLE PRECISION,
  "amountsApplied" BOOLEAN NOT NULL DEFAULT false,
  "attempts" INTEGER NOT NULL DEFAULT 0, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "project_upload_recoveries_status_nextAttemptAt_idx" ON "project_upload_recoveries"("status","nextAttemptAt");
CREATE INDEX "project_upload_recoveries_projectId_status_idx" ON "project_upload_recoveries"("projectId","status");
CREATE TABLE "dot_monitor_alerts" (
  "date" TEXT PRIMARY KEY, "messageId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
