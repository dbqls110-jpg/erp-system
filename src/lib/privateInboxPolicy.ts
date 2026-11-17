export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const MAILBOX_STATE_PREFIX = "inbox-read-";
export const MAILBOX_COOKIE = "__Host-erp-mailbox";
export const MAILBOX_CALLBACK = "https://erp-system-lojo.onrender.com/api/admin/drive-callback";
export const MAIL_IMPORT_LIMIT = 40;
export const MAIL_BODY_LIMIT = 20_000;

export function parseMailboxFolder(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100 || /[\r\n\x00-\x1f]/.test(value)) throw Error("가져올 라벨·메일함을 입력해 주세요.");
  return value.trim();
}
export function parseNaverEmail(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9._-]{1,64}@naver\.com$/i.test(value)) throw Error("@naver.com 주소를 확인해 주세요.");
  return value.toLowerCase();
}
export function parseFollowUpDate(value: unknown): Date | null {
  if (value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error("연락 일시를 확인해 주세요.");
  const result = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(result.getTime()) || toKstInput(result) !== value) throw Error("존재하지 않는 날짜입니다.");
  return result;
}
export function toKstInput(value: Date): string {
  return new Date(value.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16);
}

export interface InboxMailboxView {
  id: string; provider: string; email: string; folder: string;
  lastSyncedAt: string | null; lastErrorCode: string | null;
}
export interface InboxMailView {
  id: string; mailboxId: string; provider: string; accountEmail: string;
  subject: string; senderName: string; senderEmail: string; body: string; receivedAt: string;
}
export interface FollowUpView {
  itemKey: string; dueAt: string | null; note: string; version: number;
}
export interface PrivateInboxView {
  mailboxes: InboxMailboxView[]; messages: InboxMailView[]; followUps: FollowUpView[];
}
