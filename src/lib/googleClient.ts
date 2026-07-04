import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function buildCredentials(): object {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (b64) {
    try {
      return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_B64 파싱 실패");
    }
  }
  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "";
  const private_key = rawKey.replace(/\\n/g, "\n");
  if (!client_email || !private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Google 서비스 계정 설정이 없습니다. GOOGLE_SERVICE_ACCOUNT_B64를 Render 환경변수에 설정하세요.");
  }
  return { type: "service_account", client_email, private_key };
}

export function makeAuth(withDrive = false) {
  return new google.auth.GoogleAuth({
    credentials: buildCredentials(),
    scopes: withDrive ? [SHEETS_SCOPE, DRIVE_SCOPE] : [SHEETS_SCOPE],
  });
}

export function makeSheetsClient(withDrive = false) {
  return google.sheets({ version: "v4", auth: makeAuth(withDrive) });
}

export function makeDriveClient() {
  return google.drive({ version: "v3", auth: makeAuth(true) });
}

// 사용 가능한 Hermes 폴더 alias → folder ID 맵 (env에 등록된 것만)
export function getHermesFolderMap(): Record<string, string> {
  const raw: Record<string, string | undefined> = {
    root: process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID,
    discord: process.env.GOOGLE_DRIVE_HERMES_DISCORD_FOLDER_ID,
    marketer: process.env.GOOGLE_DRIVE_HERMES_MARKETER_FOLDER_ID,
    report: process.env.GOOGLE_DRIVE_HERMES_REPORT_FOLDER_ID,
  };
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => Boolean(v))
  ) as Record<string, string>;
}

export function resolveFolderAlias(alias: string): string | null {
  return getHermesFolderMap()[alias] ?? null;
}

// Google Drive 폴더 URL에서 folderId 파싱
// 예: https://drive.google.com/drive/folders/1aYyO3Xj... → 1aYyO3Xj...
export function parseFolderIdFromUrl(url: string): string | null {
  const match = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

// folderId, folderUrl, root 순서로 유효한 폴더 ID 반환
export function resolveEffectiveFolderId(
  folderId?: string | null,
  folderUrl?: string | null
): string | null {
  if (folderId) return folderId;
  if (folderUrl) return parseFolderIdFromUrl(folderUrl);
  return process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID ?? null;
}

export function isValidSpreadsheetId(id: string): boolean {
  return typeof id === "string" && /^[A-Za-z0-9_-]{20,60}$/.test(id);
}

// A1 notation: 탭명!A1:Z100, A1:Z1000, SheetName!A:Z 등
export function isValidRange(range: string): boolean {
  return typeof range === "string" && range.length <= 200 && /^[A-Za-z0-9 _\-'!:.]+$/.test(range);
}

export const LIMITS = {
  MAX_READ_ROWS: 1000,
  MAX_WRITE_ROWS: 500,
  MAX_COLS: 26,
  MAX_TABS: 10,
  MAX_TITLE_LEN: 100,
  MAX_INITIAL_CELLS: 13000,
} as const;
