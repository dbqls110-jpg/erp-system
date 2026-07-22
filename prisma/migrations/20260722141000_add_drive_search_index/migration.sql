CREATE TABLE IF NOT EXISTS "drive_index_folders" (
  "id" TEXT NOT NULL,
  "driveFolderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "webViewLink" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "allowedRoles" TEXT[] NOT NULL DEFAULT ARRAY['admin']::TEXT[],
  "lastScannedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drive_index_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "drive_index_files" (
  "id" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "webViewLink" TEXT,
  "modifiedTime" TIMESTAMP(3),
  "sizeBytes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "skipReason" TEXT,
  "contentHash" TEXT,
  "lastIndexedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drive_index_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drive_index_files_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "drive_index_folders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "drive_index_chunks" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "charCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drive_index_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drive_index_chunks_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "drive_index_files"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "drive_index_folders_driveFolderId_key" ON "drive_index_folders"("driveFolderId");
CREATE INDEX IF NOT EXISTS "drive_index_folders_active_idx" ON "drive_index_folders"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "drive_index_files_folderId_driveFileId_key" ON "drive_index_files"("folderId", "driveFileId");
CREATE INDEX IF NOT EXISTS "drive_index_files_driveFileId_idx" ON "drive_index_files"("driveFileId");
CREATE INDEX IF NOT EXISTS "drive_index_files_folderId_status_idx" ON "drive_index_files"("folderId", "status");
CREATE INDEX IF NOT EXISTS "drive_index_files_modifiedTime_idx" ON "drive_index_files"("modifiedTime");
CREATE UNIQUE INDEX IF NOT EXISTS "drive_index_chunks_fileId_chunkIndex_key" ON "drive_index_chunks"("fileId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "drive_index_chunks_fileId_idx" ON "drive_index_chunks"("fileId");
CREATE INDEX IF NOT EXISTS "drive_index_chunks_fts_idx" ON "drive_index_chunks" USING GIN (to_tsvector('simple', "content"));
