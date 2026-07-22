import crypto from "crypto";
import { Prisma } from "@prisma/client";
import type { drive_v3 } from "googleapis";
import { makeDriveClientAsOwner, makeSheetsClientAsOwner } from "@/lib/googleClient";
import { prisma } from "@/lib/prisma";

export const DRIVE_INDEX_LIMITS = {
  maxFilesPerFolder: 5_000,
  maxFoldersPerRoot: 500,
  maxChangedFilesPerSync: 25,
  maxTextFileBytes: 1_000_000,
  maxExtractedChars: 200_000,
  chunkChars: 1_800,
  chunkOverlap: 200,
  maxChunksPerFile: 100,
  maxSheetTabs: 10,
  maxSheetRows: 300,
  maxSheetColumns: 26,
} as const;

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "text/markdown",
  "application/json",
  "application/xml",
]);

export type DriveIndexMode = "document" | "sheet" | "text" | "metadata_only" | "skip";

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: Date | null;
  sizeBytes: string | null;
  webViewLink: string | null;
}

export interface DriveIndexSyncResult {
  ok: boolean;
  busy?: boolean;
  folders: number;
  scanned: number;
  changed: number;
  indexed: number;
  metadataOnly: number;
  skipped: number;
  deleted: number;
  errors: number;
  remaining: number;
}

export interface DriveSearchResult {
  fileId: string;
  name: string;
  mimeType: string;
  url: string | null;
  modifiedTime: string | null;
  snippet: string;
}

export async function ensureDriveIndexSchema(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ tableName: string | null }>>`
    SELECT to_regclass('public.drive_index_folders')::text AS "tableName"
  `;
  if (rows[0]?.tableName) return false;

  // Render가 migration 명령을 건너뛴 환경에서도 새 기능만 안전하게 복구한다.
  // 전부 IF NOT EXISTS인 순수 추가 작업이며 기존 ERP 테이블과 데이터는 건드리지 않는다.
  await prisma.$executeRawUnsafe(`
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
    )
  `);
  await prisma.$executeRawUnsafe(`
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
    )
  `);
  await prisma.$executeRawUnsafe(`
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
    )
  `);
  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "drive_index_folders_driveFolderId_key" ON "drive_index_folders"("driveFolderId")`,
    `CREATE INDEX IF NOT EXISTS "drive_index_folders_active_idx" ON "drive_index_folders"("active")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "drive_index_files_folderId_driveFileId_key" ON "drive_index_files"("folderId", "driveFileId")`,
    `CREATE INDEX IF NOT EXISTS "drive_index_files_driveFileId_idx" ON "drive_index_files"("driveFileId")`,
    `CREATE INDEX IF NOT EXISTS "drive_index_files_folderId_status_idx" ON "drive_index_files"("folderId", "status")`,
    `CREATE INDEX IF NOT EXISTS "drive_index_files_modifiedTime_idx" ON "drive_index_files"("modifiedTime")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "drive_index_chunks_fileId_chunkIndex_key" ON "drive_index_chunks"("fileId", "chunkIndex")`,
    `CREATE INDEX IF NOT EXISTS "drive_index_chunks_fileId_idx" ON "drive_index_chunks"("fileId")`,
    `CREATE INDEX IF NOT EXISTS "drive_index_chunks_fts_idx" ON "drive_index_chunks" USING GIN (to_tsvector('simple', "content"))`,
  ];
  for (const statement of indexes) await prisma.$executeRawUnsafe(statement);
  return true;
}

export function classifyDriveFile(mimeType: string, sizeBytes?: string | null): DriveIndexMode {
  if (mimeType === DOC_MIME) return "document";
  if (mimeType === SHEET_MIME) return "sheet";
  if (TEXT_MIMES.has(mimeType)) {
    const size = Number(sizeBytes ?? 0);
    return Number.isFinite(size) && size > DRIVE_INDEX_LIMITS.maxTextFileBytes ? "skip" : "text";
  }
  if (mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
    return "skip";
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("octet-stream")) {
    return "skip";
  }
  return "metadata_only";
}

export function chunkDriveText(input: string): Array<{ content: string; contentHash: string; charCount: number }> {
  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, DRIVE_INDEX_LIMITS.maxExtractedChars);
  if (!normalized) return [];

  const chunks: Array<{ content: string; contentHash: string; charCount: number }> = [];
  const step = DRIVE_INDEX_LIMITS.chunkChars - DRIVE_INDEX_LIMITS.chunkOverlap;
  for (let start = 0; start < normalized.length && chunks.length < DRIVE_INDEX_LIMITS.maxChunksPerFile; start += step) {
    const content = normalized.slice(start, start + DRIVE_INDEX_LIMITS.chunkChars).trim();
    if (!content) continue;
    chunks.push({
      content,
      contentHash: sha256(content),
      charCount: content.length,
    });
  }
  return chunks;
}

const SEARCH_STOP_WORDS = new Set([
  "알려줘", "알려주세요", "보여줘", "보여주세요", "확인", "확인해줘", "해주세요",
  "해줘", "이번", "현재", "관련", "대한", "있는", "없는", "그리고", "내", "제", "저의",
]);

export function extractDriveSearchTokens(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .replace(/[^0-9a-z가-힣_-]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token)),
  )].slice(0, 8);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toDriveFileMeta(file: drive_v3.Schema$File): DriveFileMeta | null {
  if (!file.id || !file.name || !file.mimeType) return null;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
    sizeBytes: file.size ?? null,
    webViewLink: file.webViewLink ?? null,
  };
}

async function listFolderTree(
  drive: drive_v3.Drive,
  rootFolderId: string,
): Promise<{ files: DriveFileMeta[]; truncated: boolean }> {
  const queue = [rootFolderId];
  const visited = new Set<string>();
  const files: DriveFileMeta[] = [];

  while (queue.length > 0 && visited.size < DRIVE_INDEX_LIMITS.maxFoldersPerRoot) {
    const folderId = queue.shift()!;
    if (visited.has(folderId)) continue;
    visited.add(folderId);

    let pageToken: string | undefined;
    do {
      const response = await drive.files.list({
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
        pageSize: 500,
        pageToken,
        spaces: "drive",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const file of response.data.files ?? []) {
        if (file.mimeType === FOLDER_MIME && file.id) {
          queue.push(file.id);
          continue;
        }
        const meta = toDriveFileMeta(file);
        if (meta) files.push(meta);
        if (files.length >= DRIVE_INDEX_LIMITS.maxFilesPerFolder) {
          return { files, truncated: true };
        }
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return { files, truncated: queue.length > 0 };
}

async function extractSheetText(file: DriveFileMeta): Promise<string> {
  const sheets = await makeSheetsClientAsOwner();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: file.id,
    fields: "properties.title,sheets.properties.title",
  });
  const tabNames = (metadata.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, DRIVE_INDEX_LIMITS.maxSheetTabs);
  if (tabNames.length === 0) return "";

  const ranges = tabNames.map((title) =>
    `'${title.replace(/'/g, "''")}'!A1:Z${DRIVE_INDEX_LIMITS.maxSheetRows}`,
  );
  const values = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: file.id,
    ranges,
    majorDimension: "ROWS",
  });
  const blocks = (values.data.valueRanges ?? []).map((range, index) => {
    const rows = (range.values ?? []).map((row) => row.slice(0, DRIVE_INDEX_LIMITS.maxSheetColumns).join("\t"));
    return `[시트: ${tabNames[index]}]\n${rows.join("\n")}`;
  });
  return blocks.join("\n\n");
}

async function extractFileText(drive: drive_v3.Drive, file: DriveFileMeta, mode: DriveIndexMode): Promise<string> {
  if (mode === "document") {
    const response = await drive.files.export({ fileId: file.id, mimeType: "text/plain" }, { responseType: "text" });
    return String(response.data ?? "");
  }
  if (mode === "sheet") return extractSheetText(file);
  if (mode === "text") {
    const response = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "text" });
    return String(response.data ?? "");
  }
  return "";
}

async function storeIndexedFile(
  folderId: string,
  file: DriveFileMeta,
  status: string,
  skipReason: string | null,
  text: string,
) {
  const chunks = text ? chunkDriveText(`${file.name}\n\n${text}`) : [];
  const contentHash = chunks.length > 0 ? sha256(chunks.map((chunk) => chunk.contentHash).join("|")) : null;
  await prisma.$transaction(async (tx) => {
    const record = await tx.driveIndexFile.upsert({
      where: { folderId_driveFileId: { folderId, driveFileId: file.id } },
      create: {
        folderId,
        driveFileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        modifiedTime: file.modifiedTime,
        sizeBytes: file.sizeBytes,
        status,
        skipReason,
        contentHash,
        lastIndexedAt: new Date(),
      },
      update: {
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        modifiedTime: file.modifiedTime,
        sizeBytes: file.sizeBytes,
        status,
        skipReason,
        contentHash,
        lastIndexedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.driveIndexChunk.deleteMany({ where: { fileId: record.id } });
    if (chunks.length > 0) {
      await tx.driveIndexChunk.createMany({
        data: chunks.map((chunk, chunkIndex) => ({ ...chunk, chunkIndex, fileId: record.id })),
      });
    }
  });
}

let activeSync: Promise<DriveIndexSyncResult> | null = null;

export async function syncDriveIndex(): Promise<DriveIndexSyncResult> {
  if (activeSync) {
    return { ok: true, busy: true, folders: 0, scanned: 0, changed: 0, indexed: 0, metadataOnly: 0, skipped: 0, deleted: 0, errors: 0, remaining: 0 };
  }
  activeSync = runDriveIndexSync();
  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}

async function runDriveIndexSync(): Promise<DriveIndexSyncResult> {
  const result: DriveIndexSyncResult = {
    ok: true,
    folders: 0,
    scanned: 0,
    changed: 0,
    indexed: 0,
    metadataOnly: 0,
    skipped: 0,
    deleted: 0,
    errors: 0,
    remaining: 0,
  };
  await ensureDriveIndexSchema();
  const folders = await prisma.driveIndexFolder.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  result.folders = folders.length;
  if (folders.length === 0) return result;

  const drive = await makeDriveClientAsOwner();
  let processingBudget = DRIVE_INDEX_LIMITS.maxChangedFilesPerSync;

  for (const folder of folders) {
    const scan = await listFolderTree(drive, folder.driveFolderId);
    const scannedFiles = scan.files;
    result.scanned += scannedFiles.length;
    const existing = await prisma.driveIndexFile.findMany({
      where: { folderId: folder.id },
      select: { driveFileId: true, modifiedTime: true, name: true, status: true },
    });
    const existingMap = new Map(existing.map((file) => [file.driveFileId, file]));
    const seenIds = new Set(scannedFiles.map((file) => file.id));
    const changed = scannedFiles.filter((file) => {
      const old = existingMap.get(file.id);
      if (!old || old.status === "deleted") return true;
      return old.name !== file.name || old.modifiedTime?.getTime() !== file.modifiedTime?.getTime();
    });
    result.changed += changed.length;

    const selected = changed.slice(0, processingBudget);
    processingBudget -= selected.length;
    result.remaining += Math.max(0, changed.length - selected.length);

    for (const file of selected) {
      const mode = classifyDriveFile(file.mimeType, file.sizeBytes);
      try {
        if (mode === "skip") {
          await storeIndexedFile(folder.id, file, "skipped", "무료 모드에서 영상·이미지·압축 또는 대용량 텍스트는 내용 색인 제외", "");
          result.skipped += 1;
          continue;
        }
        if (mode === "metadata_only") {
          await storeIndexedFile(folder.id, file, "metadata_only", "무료 모드에서 지원하지 않는 파일 형식: 메타데이터만 저장", "");
          result.metadataOnly += 1;
          continue;
        }
        const text = await extractFileText(drive, file, mode);
        if (!text.trim()) {
          await storeIndexedFile(folder.id, file, "metadata_only", "추출 가능한 텍스트 없음", "");
          result.metadataOnly += 1;
          continue;
        }
        await storeIndexedFile(folder.id, file, "indexed", null, text);
        result.indexed += 1;
      } catch (error) {
        result.errors += 1;
        await storeIndexedFile(
          folder.id,
          file,
          "error",
          error instanceof Error ? error.message.slice(0, 300) : "텍스트 추출 실패",
          "",
        );
      }
    }

    // 안전 상한 때문에 목록이 잘렸다면 보이지 않은 파일을 삭제로 오판하지 않는다.
    const deletedIds = scan.truncated
      ? []
      : existing.filter((file) => file.status !== "deleted" && !seenIds.has(file.driveFileId)).map((file) => file.driveFileId);
    if (deletedIds.length > 0) {
      const deletedRecords = await prisma.driveIndexFile.findMany({
        where: { folderId: folder.id, driveFileId: { in: deletedIds } },
        select: { id: true },
      });
      await prisma.$transaction([
        prisma.driveIndexChunk.deleteMany({ where: { fileId: { in: deletedRecords.map((file) => file.id) } } }),
        prisma.driveIndexFile.updateMany({
          where: { id: { in: deletedRecords.map((file) => file.id) } },
          data: { status: "deleted", skipReason: "Drive 폴더에서 삭제 또는 이동됨" },
        }),
      ]);
      result.deleted += deletedRecords.length;
    }

    await prisma.driveIndexFolder.update({ where: { id: folder.id }, data: { lastScannedAt: new Date() } });
    if (processingBudget <= 0) break;
  }
  return result;
}

interface DriveSearchRow {
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  modifiedTime: Date | null;
  content: string | null;
}

export async function searchDriveIndex(query: string, role: string, limit = 5): Promise<DriveSearchResult[]> {
  const tokens = extractDriveSearchTokens(query);
  if (tokens.length === 0) return [];
  const conditions = tokens.flatMap((token) => [
    Prisma.sql`file."name" ILIKE ${`%${token}%`}`,
    Prisma.sql`chunk."content" ILIKE ${`%${token}%`}`,
  ]);
  const rows = await prisma.$queryRaw<DriveSearchRow[]>(Prisma.sql`
    SELECT
      file."driveFileId" AS "fileId",
      file."name",
      file."mimeType",
      file."webViewLink",
      file."modifiedTime",
      chunk."content"
    FROM "drive_index_files" file
    JOIN "drive_index_folders" folder ON folder."id" = file."folderId"
    LEFT JOIN "drive_index_chunks" chunk ON chunk."fileId" = file."id"
    WHERE folder."active" = true
      AND ${role} = ANY(folder."allowedRoles")
      AND file."status" IN ('indexed', 'metadata_only', 'skipped')
      AND (${Prisma.join(conditions, " OR ")})
    ORDER BY
      ts_rank(to_tsvector('simple', COALESCE(chunk."content", '')), plainto_tsquery('simple', ${tokens.join(" ")})) DESC,
      file."modifiedTime" DESC NULLS LAST
    LIMIT ${Math.min(Math.max(limit * 4, 8), 40)}
  `);

  const deduped = new Map<string, DriveSearchResult>();
  for (const row of rows) {
    if (deduped.has(row.fileId)) continue;
    const content = row.content ?? `파일명: ${row.name}`;
    const positions = tokens.map((token) => content.toLowerCase().indexOf(token)).filter((index) => index >= 0);
    const firstMatch = positions.length > 0 ? Math.min(...positions) : 0;
    const start = Math.max(0, firstMatch - 140);
    const snippet = content.slice(start, start + 700).trim();
    deduped.set(row.fileId, {
      fileId: row.fileId,
      name: row.name,
      mimeType: row.mimeType,
      url: row.webViewLink,
      modifiedTime: row.modifiedTime?.toISOString() ?? null,
      snippet,
    });
    if (deduped.size >= limit) break;
  }
  return [...deduped.values()];
}
