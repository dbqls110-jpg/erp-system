import { google } from "googleapis";
import crypto from "crypto";

// ─── OAuth 오류 감지 헬퍼 ─────────────────────────────────────────────────────

export function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = String(e.message ?? "").toLowerCase();
  // googleapis 오류 구조
  const resp = e.response as Record<string, unknown> | undefined;
  const data = resp?.data as Record<string, unknown> | undefined;
  if (data?.error === "invalid_grant") return true;
  if (msg.includes("invalid_grant")) return true;
  // GaxiosError / axios 형태
  const errors = (e.errors as Array<Record<string, unknown>>) ?? [];
  if (errors.some((er) => String(er.reason ?? "").includes("invalid_grant"))) return true;
  return false;
}

// ─── 재인증 토큰 임시 암호화 저장 (DB 저장용) ────────────────────────────────

function getEncKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "fallback-not-secure";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptForStorage(plaintext: string): string {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptFromStorage(encoded: string): string {
  const key = getEncKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

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
  return typeof range === "string" && range.length <= 200 && /^[A-Za-z0-9 _\-'!:.\u3131-\uD79D]+$/.test(range);
}

// Google Sheets URL에서 spreadsheetId와 gid 추출
// 허용 도메인: docs.google.com/spreadsheets, spreadsheets.google.com
export function parseGoogleSheetUrl(url: string): { spreadsheetId: string; gid?: string } | null {
  if (typeof url !== "string") return null;
  if (!/^https:\/\/(docs\.google\.com\/spreadsheets|spreadsheets\.google\.com)/.test(url)) return null;
  const idMatch = url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,60})/);
  if (!idMatch) return null;
  const spreadsheetId = idMatch[1];
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch?.[1];
  return { spreadsheetId, ...(gid ? { gid } : {}) };
}

// spreadsheetId 또는 spreadsheetUrl에서 ID 확정. 둘 다 없으면 fallback(env) 사용
export function resolveSpreadsheetId(
  spreadsheetId?: string | null,
  spreadsheetUrl?: string | null,
  fallback?: string,
): { id: string; gid?: string } | null {
  if (spreadsheetId && isValidSpreadsheetId(spreadsheetId)) {
    return { id: spreadsheetId };
  }
  if (spreadsheetUrl) {
    const parsed = parseGoogleSheetUrl(spreadsheetUrl);
    if (parsed) return { id: parsed.spreadsheetId, gid: parsed.gid };
    return null; // URL 형식이 잘못됨 → 명시적 오류 처리를 위해 null 반환
  }
  if (fallback && isValidSpreadsheetId(fallback)) {
    return { id: fallback };
  }
  return null;
}

// dbqls110@gmail.com OAuth2 클라이언트 (Drive 파일 생성용)
function makeOwnerOAuth2() {
  const refreshToken = process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("GOOGLE_DRIVE_OWNER_REFRESH_TOKEN이 설정되지 않았습니다.");
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function makeDriveClientAsOwner() {
  return google.drive({ version: "v3", auth: makeOwnerOAuth2() });
}

export function makeSheetsClientAsOwner() {
  return google.sheets({ version: "v4", auth: makeOwnerOAuth2() });
}

export const LIMITS = {
  MAX_READ_ROWS: 1000,
  MAX_WRITE_ROWS: 500,
  MAX_COLS: 26,
  MAX_TABS: 10,
  MAX_TITLE_LEN: 100,
  MAX_INITIAL_CELLS: 13000,
} as const;
