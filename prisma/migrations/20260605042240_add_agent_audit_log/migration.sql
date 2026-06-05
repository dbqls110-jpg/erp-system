-- CreateTable
CREATE TABLE "agent_audit_logs" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_audit_logs_createdAt_idx" ON "agent_audit_logs"("createdAt");
