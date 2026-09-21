-- ERP 비서 질문에 여러 장의 사진을 연결할 수 있도록 별도 첨부 테이블을 추가한다.
CREATE TABLE "agent_job_attachments" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "driveUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_job_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_job_attachments_jobId_driveFileId_key"
  ON "agent_job_attachments"("jobId", "driveFileId");
CREATE INDEX "agent_job_attachments_jobId_createdAt_idx"
  ON "agent_job_attachments"("jobId", "createdAt");

ALTER TABLE "agent_job_attachments"
  ADD CONSTRAINT "agent_job_attachments_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "agent_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
