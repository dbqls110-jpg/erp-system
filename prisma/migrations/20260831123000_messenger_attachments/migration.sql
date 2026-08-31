ALTER TABLE "messages"
  ADD COLUMN "attachmentDriveFileId" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentMimeType" TEXT,
  ADD COLUMN "attachmentSizeBytes" INTEGER,
  ADD COLUMN "attachmentUrl" TEXT;

CREATE INDEX "messages_attachmentDriveFileId_idx"
  ON "messages"("attachmentDriveFileId");
