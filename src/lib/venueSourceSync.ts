import crypto from "node:crypto";
import { Readable } from "node:stream";
import * as XLSX from "xlsx";

import { makeDriveClientAsOwner } from "@/lib/googleClient";

const ROOT_FOLDER_NAME = "천우영 시스템";
const VENUE_FOLDER_NAME = "공간 DB";
const SNAPSHOT_FOLDER_NAME = "원본 스냅샷";
const SOURCE_CSV_NAME = "서울경기_대관공간_DB.csv";
const SOURCE_XLSX_NAME = "서울경기_대관공간_DB.xlsx";

export interface VenueSourceRow {
  name: string;
  address: string;
  district?: string | null;
  type?: string | null;
  phone?: string | null;
  reserveUrl?: string | null;
  [key: string]: string | null | undefined;
}

export interface VenueSourceSyncResult {
  csvFileId: string;
  csvFileName: string;
  xlsxUpdated: boolean;
  snapshotName: string;
  field: string;
  value: string;
  mode: "updated" | "created";
}

function driveQuote(value: string) {
  return value.replace(/'/g, "\\'");
}

function sourceKey(row: Pick<VenueSourceRow, "name" | "address">) {
  return crypto.createHash("sha1").update([row.name, row.address].map((v) => (v ?? "").trim()).join("|")).digest("hex").slice(0, 24);
}

function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((values) => values.some((value) => value !== ""));
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function stringifyCsv(rows: string[][]) {
  return `\ufeff${rows.map((row) => row.map((value) => csvCell(value ?? "")).join(",")).join("\r\n")}\r\n`;
}

async function findFolder(drive: ReturnType<typeof makeDriveClientAsOwner> extends Promise<infer T> ? T : never, name: string, parentId?: string | null) {
  const parent = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const res = await drive.files.list({
    q: `name = '${driveQuote(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parent}`,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 100,
  });
  return res.data.files?.[0] ?? null;
}

async function findFile(drive: ReturnType<typeof makeDriveClientAsOwner> extends Promise<infer T> ? T : never, name: string, parentId: string) {
  const res = await drive.files.list({
    q: `name = '${driveQuote(name)}' and '${parentId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size)",
    spaces: "drive",
    pageSize: 10,
  });
  return res.data.files?.[0] ?? null;
}

async function latestSourceFiles(drive: Parameters<typeof findFile>[0]) {
  const root = await findFolder(drive, ROOT_FOLDER_NAME);
  const venue = root?.id ? await findFolder(drive, VENUE_FOLDER_NAME, root.id) : null;
  const snapshots = venue?.id ? await findFolder(drive, SNAPSHOT_FOLDER_NAME, venue.id) : null;
  if (!snapshots?.id) throw new Error("Drive에 공간 DB 원본 스냅샷 폴더가 없습니다.");

  const folders = await drive.files.list({
    q: `'${snapshots.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    orderBy: "name desc",
    spaces: "drive",
    pageSize: 200,
  });
  for (const folder of folders.data.files ?? []) {
    if (!folder.id) continue;
    const csv = await findFile(drive, SOURCE_CSV_NAME, folder.id);
    if (csv?.id) {
      return {
        folderId: folder.id,
        snapshotName: folder.name ?? "최근 스냅샷",
        csv,
        xlsx: await findFile(drive, SOURCE_XLSX_NAME, folder.id),
      };
    }
  }
  throw new Error("공간 DB 원본 CSV가 들어 있는 스냅샷을 찾지 못했습니다.");
}

async function downloadBuffer(drive: Parameters<typeof findFile>[0], fileId: string) {
  const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(response.data as ArrayBuffer);
}

async function updateFile(drive: Parameters<typeof findFile>[0], fileId: string, buffer: Buffer, mimeType: string) {
  await drive.files.update({
    fileId,
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id,name,modifiedTime",
  });
}

function locateRow(rows: string[][], field: string, value: string, expectedKey: string) {
  const header = rows[0] ?? [];
  const nameIndex = header.indexOf("이름");
  const addressIndex = header.indexOf("위치");
  if (nameIndex < 0 || addressIndex < 0) throw new Error("원본 CSV에 이름·위치 열이 없어 안전하게 동기화할 수 없습니다.");
  const rowIndex = rows.slice(1).findIndex((row) => sourceKey({ name: row[nameIndex] ?? "", address: row[addressIndex] ?? "" }) === expectedKey);
  if (rowIndex < 0) {
    throw new Error(`원본 CSV에서 '${field}'를 입력할 공간 행을 찾지 못했습니다.`);
  }
  return { header, rowIndex: rowIndex + 1 };
}

function updateCsv(rows: string[][], input: { mode: "updated" | "created"; row: VenueSourceRow; sourceKey: string; field: string; value: string }) {
  const header = rows[0] ?? [];
  let columnIndex = input.field ? header.indexOf(input.field) : -1;
  if (input.field && columnIndex < 0) { columnIndex = header.length; header.push(input.field); }
  if (input.mode === "created") {
    const nameIndex = header.indexOf("이름");
    const addressIndex = header.indexOf("위치");
    if (nameIndex >= 0 && addressIndex >= 0 && rows.slice(1).some((row) => sourceKey({ name: row[nameIndex] ?? "", address: row[addressIndex] ?? "" }) === input.sourceKey)) {
      throw new Error("원본 CSV에 같은 이름과 주소의 공간이 이미 있어 중복 등록하지 않았습니다.");
    }
    const newRow = Array.from({ length: header.length }, () => "");
    const values: Record<string, string> = { "이름": input.row.name, "위치": input.row.address, "자치구": input.row.district ?? "", "유형": input.row.type ?? "", "대관문의_전화": input.row.phone ?? "", "예약URL": input.row.reserveUrl ?? "" };
    for (const [key, value] of Object.entries(input.row)) if (value !== undefined && value !== null) values[key] = String(value);
    for (const [key, value] of Object.entries(values)) {
      const index = header.indexOf(key);
      if (index >= 0) newRow[index] = value;
    }
    if (columnIndex >= 0) newRow[columnIndex] = input.value;
    rows.push(newRow);
  } else {
    const found = locateRow(rows, input.field, input.row.name, input.sourceKey);
    const target = rows[found.rowIndex];
    while (target.length < header.length) target.push("");
    target[columnIndex] = input.value;
  }
  return stringifyCsv(rows);
}

function updateWorkbook(buffer: Buffer, input: { mode: "updated" | "created"; row: VenueSourceRow; sourceKey: string; field: string; value: string }) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("원본 XLSX에 시트가 없습니다.");
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
  const header = (rows[0] ?? []).map((value) => String(value ?? ""));
  let columnIndex = input.field ? header.indexOf(input.field) : -1;
  if (input.field && columnIndex < 0) { columnIndex = header.length; sheet[XLSX.utils.encode_cell({ r: 0, c: columnIndex })] = { t: "s", v: input.field }; range.e.c = Math.max(range.e.c, columnIndex); }
  let rowIndex = -1;
  if (input.mode === "updated") {
    const nameIndex = header.indexOf("이름");
    const addressIndex = header.indexOf("위치");
    rowIndex = rows.slice(1).findIndex((row) => sourceKey({ name: String(row[nameIndex] ?? ""), address: String(row[addressIndex] ?? "") }) === input.sourceKey) + 1;
    if (rowIndex <= 0) throw new Error("원본 XLSX에서 동기화할 공간 행을 찾지 못했습니다.");
  } else {
    rowIndex = range.e.r + 1;
    const values: Record<string, string> = { "이름": input.row.name, "위치": input.row.address, "자치구": input.row.district ?? "", "유형": input.row.type ?? "", "대관문의_전화": input.row.phone ?? "", "예약URL": input.row.reserveUrl ?? "" };
    for (const [key, value] of Object.entries(input.row)) if (value !== undefined && value !== null) values[key] = String(value);
    for (const [key, value] of Object.entries(values)) { const index = header.indexOf(key); if (index >= 0) sheet[XLSX.utils.encode_cell({ r: rowIndex, c: index })] = { t: "s", v: value }; }
    range.e.r = rowIndex;
  }
  if (columnIndex >= 0) sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] = { t: "s", v: input.value };
  sheet["!ref"] = XLSX.utils.encode_range(range);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function syncVenueSource(input: { mode: "updated" | "created"; row: VenueSourceRow; sourceKey: string; field: string; value: string }): Promise<VenueSourceSyncResult> {
  const drive = await makeDriveClientAsOwner();
  const files = await latestSourceFiles(drive);
  const csv = await downloadBuffer(drive, files.csv.id!);
  const csvText = updateCsv(parseCsv(csv.toString("utf8")), input);
  await updateFile(drive, files.csv.id!, Buffer.from(csvText, "utf8"), "text/csv");

  let xlsxUpdated = false;
  if (files.xlsx?.id) {
    const xlsx = await downloadBuffer(drive, files.xlsx.id);
    await updateFile(drive, files.xlsx.id, updateWorkbook(xlsx, input), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    xlsxUpdated = true;
  }

  return {
    csvFileId: files.csv.id!,
    csvFileName: files.csv.name ?? SOURCE_CSV_NAME,
    xlsxUpdated,
    snapshotName: files.snapshotName,
    field: input.field,
    value: input.value,
    mode: input.mode,
  };
}

export function venueSourceKey(name: string, address: string) {
  return sourceKey({ name, address });
}
