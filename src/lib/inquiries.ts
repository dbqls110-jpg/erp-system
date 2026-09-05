export const INQUIRY_STAGES = [
  "문의",
  "1차 연락",
  "2차 연락",
  "3차 연락",
  "성사",
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
  projectName: string;
  wonAt: string;
  projectId?: string;
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

export type InquiryClosePoint = "연락 전" | "1차" | "2차" | "3차";

function hasCellValue(value: string): boolean {
  return value.trim().length > 0;
}

/** 종료 카드를 어느 연락 단계에서 잃었는지 시트의 사실 기록으로만 판정한다. */
export function getInquiryClosePoint(
  record: Pick<InquiryRecord, "contact1At" | "contact2At" | "contact3At">,
): InquiryClosePoint {
  if (!hasCellValue(record.contact1At)) return "연락 전";
  if (!hasCellValue(record.contact2At)) return "1차";
  if (!hasCellValue(record.contact3At)) return "2차";
  return "3차";
}

export interface InquirySummary {
  monthKey: string;
  inquiryCount: number;
  contact1Count: number;
  contact2Count: number;
  contact3Count: number;
  wonCount: number;
  dropOff: Record<InquiryClosePoint, number>;
}

function monthKeyFromDate(value: string): string | null {
  const parsed = parseSheetDateTime(value);
  if (!parsed) return null;
  const parts = dateParts(parsed);
  return `${parts.year}-${parts.month}`;
}

function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 시트 원본을 월별 영업 지표로 바꾸며, 조회나 화면 상태에는 의존하지 않는다. */
export function summarizeInquiries(
  records: readonly InquiryRecord[],
  monthKey: string,
): InquirySummary {
  const summary: InquirySummary = {
    monthKey,
    inquiryCount: 0,
    contact1Count: 0,
    contact2Count: 0,
    contact3Count: 0,
    wonCount: 0,
    dropOff: { "연락 전": 0, "1차": 0, "2차": 0, "3차": 0 },
  };
  if (!isMonthKey(monthKey)) return summary;

  for (const record of records) {
    if (monthKeyFromDate(record.submittedAt) !== monthKey) continue;
    summary.inquiryCount += 1;
    if (hasCellValue(record.contact1At)) summary.contact1Count += 1;
    if (hasCellValue(record.contact2At)) summary.contact2Count += 1;
    if (hasCellValue(record.contact3At)) summary.contact3Count += 1;
    // 성사 시각은 P열에 남기므로 나중에 종료로 옮겨도 성사 건수는 유지하고, 예전 수기 데이터도 놓치지 않는다.
    if (hasCellValue(record.wonAt) || record.status === "성사") summary.wonCount += 1;
    if (record.status === "종료") summary.dropOff[getInquiryClosePoint(record)] += 1;
  }

  return summary;
}

export function getCurrentInquiryMonth(now = new Date()): string {
  const parts = dateParts(now);
  return `${parts.year}-${parts.month}`;
}

export function formatInquiryMonth(monthKey: string): string {
  if (!isMonthKey(monthKey)) return monthKey;
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

export function shiftInquiryMonth(monthKey: string, offset: number): string {
  if (!isMonthKey(monthKey) || !Number.isInteger(offset)) return monthKey;
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
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
  record: Pick<InquiryRecord, "contact1At" | "contact2At" | "contact3At" | "closedAt"> &
    Partial<Pick<InquiryRecord, "wonAt">>,
  stage: InquiryStage,
): string {
  if (stage === "1차 연락") return record.contact1At;
  if (stage === "2차 연락") return record.contact2At;
  if (stage === "3차 연락") return record.contact3At;
  if (stage === "성사") return record.wonAt ?? "";
  if (stage === "종료") return record.closedAt;
  return "";
}

export function parseInquiryRows(rows: readonly (readonly unknown[])[]): InquiryRecord[] {
  return rows.slice(1).flatMap((values, index) => {
    const normalized = Array.from({ length: 16 }, (_, columnIndex) => column(values, columnIndex));
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
      projectName: normalized[14],
      wonAt: normalized[15],
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
      ? [{ rowNumber: index + 2, values: Array.from({ length: 16 }, (_, columnIndex) => column(values, columnIndex)) }]
      : [];
  });
}

export function inquiryIdentityKey(identity: InquiryIdentity): string {
  return [identity.submittedAt, identity.name, identity.email, identity.phone]
    .map((value) => normalizeText(value).toLowerCase())
    .join("|");
}

export function getFollowupAge(
  record: Pick<InquiryRecord, "status" | "contact1At" | "contact2At" | "contact3At" | "closedAt"> &
    Partial<Pick<InquiryRecord, "wonAt">>,
  now = new Date(),
): { overdue: boolean; dayLabel: string | null } {
  if (record.status === "문의" || record.status === "성사" || record.status === "종료") {
    return { overdue: false, dayLabel: null };
  }
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
