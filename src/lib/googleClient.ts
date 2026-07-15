import { google } from "googleapis";
import crypto from "crypto";

// ─── OAuth 오류 감지 ──────────────────────────────────────────────────────────

export function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = String(e.message ?? "").toLowerCase();
  const resp = e.response as Record<string, unknown> | undefined;
  const data = resp?.data as Record<string, unknown> | undefined;
  if (data?.error === "invalid_grant") return true;
  if (msg.includes("invalid_grant")) return true;
  const errors = (e.errors as Array<Record<string, unknown>>) ?? [];
  if (errors.some((er) => String(er.reason ?? "").includes("invalid_grant"))) return true;
  return false;
}

export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const resp = e.response as Record<string, unknown> | undefined;
  const status = resp?.status as number | undefined;
  // 일시적 오류만 재시도 허용: 5xx + 네트워크
  if (typeof status === "number" && status >= 500) return true;
  const msg = String(e.message ?? "").toLowerCase();
  return msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("enotfound");
}

// ─── 암호화 키 ────────────────────────────────────────────────────────────────
// DRIVE_TOKEN_ENC_KEY: 고정된 32자 이상 문자열. 배포마다 변경하면 안 됨.
// 없으면 NEXTAUTH_SECRET fallback (dev 허용, prod에서는 경고).

function getEncKey(): Buffer {
  const key = process.env.DRIVE_TOKEN_ENC_KEY ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!key) {
    throw new Error(
      "[googleClient] DRIVE_TOKEN_ENC_KEY 또는 NEXTAUTH_SECRET 환경변수가 없습니다. " +
      "서버를 시작할 수 없습니다."
    );
  }
  if (key.length < 16) {
    throw new Error(
      "[googleClient] DRIVE_TOKEN_ENC_KEY가 너무 짧습니다 (최소 16자). " +
      "배포마다 동일한 키를 사용해야 합니다."
    );
  }
  if (process.env.NODE_ENV === "production" && !process.env.DRIVE_TOKEN_ENC_KEY) {
    console.warn(
      "[googleClient] 프로덕션에서 DRIVE_TOKEN_ENC_KEY 대신 NEXTAUTH_SECRET을 사용 중입니다. " +
      "전용 DRIVE_TOKEN_ENC_KEY 설정을 권장합니다."
    );
  }
  return crypto.createHash("sha256").update(key).digest();
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

// ─── Drive OAuth 토큰 (DB 우선, env 폴백) ─────────────────────────────────────
// drive-callback이 암호화해 DB에 저장 → 수동 env 입력 불필요
// env var(GOOGLE_DRIVE_OWNER_REFRESH_TOKEN)는 마이그레이션 기간 폴백으로만 사용

let _cachedRefreshToken: string | null = null;

export function clearDriveTokenCache() {
  _cachedRefreshToken = null;
}

export async function getDriveRefreshToken(): Promise<string> {
  if (process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN) {
    return process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  }
  if (_cachedRefreshToken) return _cachedRefreshToken;

  // 동적 import로 순환 의존성 회피
  const { prisma } = await import("@/lib/prisma");
  const record = await prisma.agentAuditLog.findFirst({
    where: { action: "drive_oauth_active" },
    orderBy: { createdAt: "desc" },
    select: { result: true },
  });

  if (!record?.result) {
    throw new Error(
      "Google Drive refresh_token이 없습니다. /api/admin/drive-setup 방문 후 재인증하세요."
    );
  }
  const r = record.result as Record<string, string>;
  if (!r.enc) throw new Error("저장된 Drive 토큰 데이터가 손상됐습니다.");

  try {
    _cachedRefreshToken = decryptFromStorage(r.enc);
    return _cachedRefreshToken;
  } catch {
    throw new Error(
      "Drive 토큰 복호화 실패. DRIVE_TOKEN_ENC_KEY(또는 NEXTAUTH_SECRET)가 인증 당시와 동일한지 확인하세요."
    );
  }
}

export async function makeDriveClientAsOwner() {
  const refreshToken = await getDriveRefreshToken();
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

export async function makeSheetsClientAsOwner() {
  const refreshToken = await getDriveRefreshToken();
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.sheets({ version: "v4", auth: oauth2 });
}

// ─── 서비스 계정 (Sheets 읽기/쓰기) ──────────────────────────────────────────

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE  = "https://www.googleapis.com/auth/drive";

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
    throw new Error(
      "Google 서비스 계정 설정이 없습니다. GOOGLE_SERVICE_ACCOUNT_B64를 Render 환경변수에 설정하세요."
    );
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

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

export function getHermesFolderMap(): Record<string, string> {
  const raw: Record<string, string | undefined> = {
    root:     process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID,
    discord:  process.env.GOOGLE_DRIVE_HERMES_DISCORD_FOLDER_ID,
    marketer: process.env.GOOGLE_DRIVE_HERMES_MARKETER_FOLDER_ID,
    report:   process.env.GOOGLE_DRIVE_HERMES_REPORT_FOLDER_ID,
  };
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => Boolean(v))
  ) as Record<string, string>;
}

export function resolveFolderAlias(alias: string): string | null {
  return getHermesFolderMap()[alias] ?? null;
}

export function parseFolderIdFromUrl(url: string): string | null {
  const match = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

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

export function isValidRange(range: string): boolean {
  return typeof range === "string" && range.length <= 200 &&
    /^[A-Za-z0-9 _\-'!:.ㄱ-힝]+$/.test(range);
}

export function parseGoogleSheetUrl(url: string): { spreadsheetId: string; gid?: string } | null {
  if (typeof url !== "string") return null;
  if (!/^https:\/\/(docs\.google\.com\/spreadsheets|spreadsheets\.google\.com)/.test(url)) return null;
  const idMatch = url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,60})/);
  if (!idMatch) return null;
  const spreadsheetId = idMatch[1];
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  return { spreadsheetId, ...(gidMatch ? { gid: gidMatch[1] } : {}) };
}

export function resolveSpreadsheetId(
  spreadsheetId?: string | null,
  spreadsheetUrl?: string | null,
  fallback?: string,
): { id: string; gid?: string } | null {
  if (spreadsheetId && isValidSpreadsheetId(spreadsheetId)) return { id: spreadsheetId };
  if (spreadsheetUrl) {
    const parsed = parseGoogleSheetUrl(spreadsheetUrl);
    if (parsed) return { id: parsed.spreadsheetId, gid: parsed.gid };
    return null;
  }
  if (fallback && isValidSpreadsheetId(fallback)) return { id: fallback };
  return null;
}

export const LIMITS = {
  MAX_READ_ROWS:     1000,
  MAX_WRITE_ROWS:    500,
  MAX_COLS:          26,
  MAX_TABS:          10,
  MAX_TITLE_LEN:     100,
  MAX_INITIAL_CELLS: 13000,
} as const;
