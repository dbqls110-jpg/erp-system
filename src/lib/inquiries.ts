export const INQUIRY_STAGES = [
  "문의",
  "1차 연락",
  "2차 연락",
  "3차 연락",
  "종료",
] as const;

export type InquiryStage = (typeof INQUIRY_STAGES)[number];

export interface InquiryIdentity {
  submittedAt: string;
  name: string;
  email: string;
  phone: string;
}

export interface InquiryRecord {
  id: string;
  rowNumber: number;
  identity: InquiryIdentity;
  submittedAt: string;
  name: string;
  email: string;
  phone: string;
  rentalType: string;
  desiredArea: string;
  content: string;
  status: InquiryStage;
  assignee: string;
  memo: string;
  contact1At: string;
  contact2At: string;
  contact3At: string;
  closedAt: string;
}

export interface InquiryRowMatch {
  rowNumber: number;
  values: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOWUP_HIGHLIGHT_MS = 48 * 60 * 60 * 1000;
const CLOSED_HIDE_MS = 72 * 60 * 60 * 1000;

const KST_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function cell(value: unknown): string {
  return String(value ?? "").trim();
}

function column(values: readonly unknown[], index: number): string {
  return cell(values[index]);
}

function identityFromValues(values: readonly unknown[]): InquiryIdentity {
  return {
    submittedAt: column(values, 0),
    name: column(values, 1),
    email: column(values, 2),
    phone: column(values, 3),
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeEmail(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits || normalizeText(value);
}

function dateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    KST_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

function makeKstDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  // 시트의 날짜 문자열에는 시간대가 없으므로 베뉴다 업무 시간인 한국 시간으로 해석한다.
  const result = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
  const parts = dateParts(result);
  if (
    parts.year !== String(year).padStart(4, "0") ||
    parts.month !== String(month).padStart(2, "0") ||
    parts.day !== String(day).padStart(2, "0") ||
    parts.hour !== String(hour).padStart(2, "0") ||
    parts.minute !== String(minute).padStart(2, "0") ||
    parts.second !== String(second).padStart(2, "0")
  ) {
    return null;
  }
  return result;
}

/** 시트 지역 설정이 달라도 연락 경과 시간을 같은 절대 시각으로 비교하기 위한 파서다. */
export function parseSheetDateTime(value: string): Date | null {
  const text = value.trim().replace(/\u00a0/g, " ");
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const isoDate = new Date(text);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }

  const match = text.match(
    /^(\d{4})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})(?:\s+(오전|오후|AM|PM)\s*)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let hour = Number(match[5] ?? 0);
  const minute = Number(match[6] ?? 0);
  const second = Number(match[7] ?? 0);
  const meridiem = match[4]?.toLowerCase();

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "오후" || meridiem === "pm") hour = hour === 12 ? 12 : hour + 12;
    if (meridiem === "오전" || meridiem === "am") hour = hour === 12 ? 0 : hour;
  }

  return makeKstDate(year, month, day, hour, minute, second);
}

export function formatSheetDateTime(value: string | Date): string {
  const parsed = value instanceof Date ? value : parseSheetDateTime(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return typeof value === "string" ? value.trim() : "";
  const parts = dateParts(parsed);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatCurrentDateTime(now = new Date()): string {
  return formatSheetDateTime(now);
}

export function isInquiryStage(value: unknown): value is InquiryStage {
  return typeof value === "string" && INQUIRY_STAGES.includes(value as InquiryStage);
}

export function stageTimestampFor(
  record: Pick<InquiryRecord, "contact1At" | "contact2At" | "contact3At" | "closedAt">,
  stage: InquiryStage,
): string {
  if (stage === "1차 연락") return record.contact1At;
  if (stage === "2차 연락") return record.contact2At;
  if (stage === "3차 연락") return record.contact3At;
  if (stage === "종료") return record.closedAt;
  return "";
}

export function parseInquiryRows(rows: readonly (readonly unknown[])[]): InquiryRecord[] {
  return rows.slice(1).flatMap((values, index) => {
    const normalized = Array.from({ length: 14 }, (_, columnIndex) => column(values, columnIndex));
    if (!normalized.some(Boolean)) return [];

    const identity = identityFromValues(normalized);
    const status = isInquiryStage(normalized[7]) ? normalized[7] : "문의";
    const rowNumber = index + 2;

    return [{
      id: `${inquiryIdentityKey(identity)}:${rowNumber}`,
      rowNumber,
      identity,
      submittedAt: normalized[0],
      name: normalized[1],
      email: normalized[2],
      phone: normalized[3],
      rentalType: normalized[4],
      desiredArea: normalized[5],
      content: normalized[6],
      status,
      assignee: normalized[8],
      memo: normalized[9],
      contact1At: normalized[10],
      contact2At: normalized[11],
      contact3At: normalized[12],
      closedAt: normalized[13],
    }];
  });
}

function sameDate(left: string, right: string): boolean {
  const leftDate = parseSheetDateTime(left);
  const rightDate = parseSheetDateTime(right);
  if (leftDate && rightDate) return leftDate.getTime() === rightDate.getTime();
  return normalizeText(left) === normalizeText(right);
}

function sameIdentity(left: InquiryIdentity, right: InquiryIdentity): boolean {
  return (
    sameDate(left.submittedAt, right.submittedAt) &&
    normalizeText(left.name) === normalizeText(right.name) &&
    normalizeEmail(left.email) === normalizeEmail(right.email) &&
    normalizePhone(left.phone) === normalizePhone(right.phone)
  );
}

/** 행 삭제로 번호가 달라져도 잘못된 문의를 바꾸지 않도록 저장 직전에 다시 찾는다. */
export function findInquiryRows(
  rows: readonly (readonly unknown[])[],
  identity: InquiryIdentity,
): InquiryRowMatch[] {
  return rows.slice(1).flatMap((values, index) => {
    const candidate = identityFromValues(values);
    return sameIdentity(candidate, identity)
      ? [{ rowNumber: index + 2, values: Array.from({ length: 14 }, (_, columnIndex) => column(values, columnIndex)) }]
      : [];
  });
}

export function inquiryIdentityKey(identity: InquiryIdentity): string {
  return [identity.submittedAt, identity.name, identity.email, identity.phone]
    .map((value) => normalizeText(value).toLowerCase())
    .join("|");
}

export function getFollowupAge(
  record: Pick<InquiryRecord, "status" | "contact1At" | "contact2At" | "contact3At" | "closedAt">,
  now = new Date(),
): { overdue: boolean; dayLabel: string | null } {
  if (record.status === "문의" || record.status === "종료") return { overdue: false, dayLabel: null };
  const timestamp = stageTimestampFor(record, record.status);
  const startedAt = parseSheetDateTime(timestamp);
  const elapsed = startedAt ? now.getTime() - startedAt.getTime() : 0;
  if (!startedAt || elapsed <= FOLLOWUP_HIGHLIGHT_MS) return { overdue: false, dayLabel: null };
  return { overdue: true, dayLabel: `${Math.floor(elapsed / DAY_MS) + 1}일째` };
}

export function shouldHideInquiry(
  record: Pick<InquiryRecord, "status" | "closedAt">,
  now = new Date(),
): boolean {
  if (record.status !== "종료") return false;
  const closedAt = parseSheetDateTime(record.closedAt);
  return Boolean(closedAt && now.getTime() - closedAt.getTime() > CLOSED_HIDE_MS);
}
