-- AlterTable
ALTER TABLE "agent_jobs" ADD COLUMN "sourceMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agent_jobs_sourceMessageId_key" ON "agent_jobs"("sourceMessageId");
