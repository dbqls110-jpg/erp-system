import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  DRIVE_INDEX_LIMITS,
  chunkDriveText,
  classifyDriveFile,
  extractDriveSearchTokens,
} from "@/lib/driveIndex";

describe("free Drive indexing", () => {
  it("indexes only supported text formats", () => {
    expect(classifyDriveFile("application/vnd.google-apps.document")).toBe("document");
    expect(classifyDriveFile("application/vnd.google-apps.spreadsheet")).toBe("sheet");
    expect(classifyDriveFile("text/plain", "1000")).toBe("text");
    expect(classifyDriveFile("video/mp4", "1000")).toBe("skip");
    expect(classifyDriveFile("application/pdf", "1000")).toBe("metadata_only");
    expect(classifyDriveFile("text/plain", String(DRIVE_INDEX_LIMITS.maxTextFileBytes + 1))).toBe("skip");
  });

  it("chunks and caps extracted text without storing a binary original", () => {
    const text = "가나다라마바사 ".repeat(1000);
    const chunks = chunkDriveText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(DRIVE_INDEX_LIMITS.maxChunksPerFile);
    expect(chunks.every((chunk) => chunk.charCount <= DRIVE_INDEX_LIMITS.chunkChars)).toBe(true);
    expect(chunks.every((chunk) => chunk.contentHash.length === 64)).toBe(true);
  });

  it("removes conversational filler from search terms", () => {
    expect(extractDriveSearchTokens("카페 공간대관 취소 규정 알려줘")).toEqual([
      "카페",
      "공간대관",
      "취소",
      "규정",
    ]);
  });
});

describe("Drive index migration", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260722141000_add_drive_search_index/migration.sql",
  );

  it("is additive and creates the full-text index", () => {
    const sql = fs.readFileSync(migrationPath, "utf8").toUpperCase();
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("DROP COLUMN");
    expect(sql).not.toContain("TRUNCATE");
    expect(sql).toContain("DRIVE_INDEX_FOLDERS");
    expect(sql).toContain("DRIVE_INDEX_FILES");
    expect(sql).toContain("DRIVE_INDEX_CHUNKS_FTS_IDX");
  });
});
