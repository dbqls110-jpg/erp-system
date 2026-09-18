-- ERP 비서 질문에도 사진을 붙일 수 있도록 메신저 첨부 메타데이터를 저장한다.
ALTER TABLE "agent_jobs" ADD COLUMN "attachmentDriveFileId" TEXT;
ALTER TABLE "agent_jobs" ADD COLUMN "attachmentName" TEXT;
ALTER TABLE "agent_jobs" ADD COLUMN "attachmentMimeType" TEXT;
ALTER TABLE "agent_jobs" ADD COLUMN "attachmentSizeBytes" INTEGER;
ALTER TABLE "agent_jobs" ADD COLUMN "attachmentUrl" TEXT;

CREATE INDEX "agent_jobs_attachmentDriveFileId_idx" ON "agent_jobs"("attachmentDriveFileId");
