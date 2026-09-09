import {
  formatInquiryMonth,
  formatSheetDateTime,
  getCurrentInquiryMonth,
  parseSheetDateTime,
  shiftInquiryMonth,
} from "@/lib/inquiries";

export const SPACE_RENTAL_STAGES = [
  "문의",
  "1차 연락",
  "2차 연락",
  "성사",
  "종료",
] as const;

export type SpaceRentalStage = (typeof SPACE_RENTAL_STAGES)[number];

export interface SpaceRentalIdentity {
  category: string;
  reservationNumber: string;
  email: string;
}

export interface SpaceRentalRecord {
  id: string;
  rowNumber: number;
  identity: SpaceRentalIdentity;
  category: string;
  reservationNumber: string;
  receivedAt: string;
  assignee: string;
  reserverName: string;
  email: string;
  client: string;
  agency: string;
  phone: string;
  eventType: string;
  eventName: string;
  schedule: string;
  detailTime: string;
  venue: string;
  attendees: string;
  serviceType: string;
  content: string;
  settlement: string;
  quote: string;
  budget: string;
  revenue: string;
  revenueDate: string;
  status: SpaceRentalStage;
  contact1Note: string;
  contact2Note: string;
  contact3Note: string;
  consultation: string;
  customerReply: string;
  progress: string;
  notProceedReason: string;
  note: string;
  quoteUrl1: string;
  quoteUrl2: string;
  direction: string;
  contact1At: string;
  contact2At: string;
  closedAt: string;
  projectName: string;
  wonAt: string;
}

export interface SpaceRentalRowMatch {
  rowNumber: number;
  values: string[];
}

export interface SpaceRentalSummary {
  monthKey: string;
  totalCount: number;
  stageCounts: Record<SpaceRentalStage, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOWUP_HIGHLIGHT_MS = 48 * 60 * 60 * 1000;
const CLOSED_HIDE_MS = 48 * 60 * 60 * 1000;
const SPACE_RENTAL_COLUMN_COUNT = 39;

function cell(value: unknown): string {
  return String(value ?? "").trim();
}

function column(values: readonly unknown[], index: number): string {
  return cell(values[index]);
}

function identityFromValues(values: readonly unknown[]): SpaceRentalIdentity {
  return {
    category: column(values, 0),
    reservationNumber: column(values, 1),
    email: column(values, 5),
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmail(value: string): string {
  return normalizeText(value);
}

function sameIdentity(left: SpaceRentalIdentity, right: SpaceRentalIdentity): boolean {
  return (
    normalizeText(left.category) === normalizeText(right.category) &&
    normalizeText(left.reservationNumber) === normalizeText(right.reservationNumber) &&
    normalizeEmail(left.email) === normalizeEmail(right.email)
  );
}

export function isSpaceRentalStage(value: unknown): value is SpaceRentalStage {
  return typeof value === "string" && SPACE_RENTAL_STAGES.includes(value as SpaceRentalStage);
}

export function spaceRentalIdentityKey(identity: SpaceRentalIdentity): string {
  return [identity.category, identity.reservationNumber, identity.email].map(normalizeText).join("|");
}

export function parseSpaceRentalRows(
  rows: readonly (readonly unknown[])[],
): SpaceRentalRecord[] {
  return rows.slice(1).flatMap((values, index) => {
    // Google Sheets omits trailing empty cells. Pad through AM so an old AH-only row is safe.
    const normalized = Array.from(
      { length: SPACE_RENTAL_COLUMN_COUNT },
      (_, columnIndex) => column(values, columnIndex),
    );
    if (!normalized.some(Boolean)) return [];

    const identity = identityFromValues(normalized);
    const rowNumber = index + 2;
    const status = isSpaceRentalStage(normalized[22]) ? normalized[22] : "문의";

    return [{
      id: `${spaceRentalIdentityKey(identity)}:${rowNumber}`,
      rowNumber,
      identity,
      category: normalized[0],
      reservationNumber: normalized[1],
      receivedAt: normalized[2],
      assignee: normalized[3],
      reserverName: normalized[4],
      email: normalized[5],
      client: normalized[6],
      agency: normalized[7],
      phone: normalized[8],
      eventType: normalized[9],
      eventName: normalized[10],
      schedule: normalized[11],
      detailTime: normalized[12],
      venue: normalized[13],
      attendees: normalized[14],
      serviceType: normalized[15],
      content: normalized[16],
      settlement: normalized[17],
      quote: normalized[18],
      budget: normalized[19],
      revenue: normalized[20],
      revenueDate: normalized[21],
      status,
      contact1Note: normalized[23],
      contact2Note: normalized[24],
      contact3Note: normalized[25],
      consultation: normalized[26],
      customerReply: normalized[27],
      progress: normalized[28],
      notProceedReason: normalized[29],
      note: normalized[30],
      quoteUrl1: normalized[31],
      quoteUrl2: normalized[32],
      direction: normalized[33],
      contact1At: normalized[34],
      contact2At: normalized[35],
      closedAt: normalized[36],
      projectName: normalized[37],
      wonAt: normalized[38],
    }];
  });
}

/** A·B·F 세 값이 모두 일치하는 행만 수정 대상으로 삼는다. */
export function findSpaceRentalRows(
  rows: readonly (readonly unknown[])[],
  identity: SpaceRentalIdentity,
): SpaceRentalRowMatch[] {
  return rows.slice(1).flatMap((values, index) => {
    const candidate = identityFromValues(values);
    return sameIdentity(candidate, identity)
      ? [{
        rowNumber: index + 2,
        values: Array.from({ length: SPACE_RENTAL_COLUMN_COUNT }, (_, columnIndex) => column(values, columnIndex)),
      }]
      : [];
  });
}

export function spaceRentalStageTimestamp(
  record: Pick<SpaceRentalRecord, "contact1At" | "contact2At" | "closedAt" | "wonAt">,
  stage: SpaceRentalStage,
): string {
  if (stage === "1차 연락") return record.contact1At;
  if (stage === "2차 연락") return record.contact2At;
  if (stage === "성사") return record.wonAt;
  if (stage === "종료") return record.closedAt;
  return "";
}

export function getSpaceRentalFollowupAge(
  record: Pick<SpaceRentalRecord, "status" | "contact1At" | "contact2At" | "closedAt" | "wonAt">,
  now = new Date(),
): { overdue: boolean; dayLabel: string | null } {
  if (record.status === "문의" || record.status === "성사" || record.status === "종료") {
    return { overdue: false, dayLabel: null };
  }
  const startedAt = parseSheetDateTime(spaceRentalStageTimestamp(record, record.status));
  const elapsed = startedAt ? now.getTime() - startedAt.getTime() : 0;
  if (!startedAt || elapsed <= FOLLOWUP_HIGHLIGHT_MS) return { overdue: false, dayLabel: null };
  return { overdue: true, dayLabel: `${Math.floor(elapsed / DAY_MS) + 1}일째` };
}

export function shouldHideSpaceRental(
  record: Pick<SpaceRentalRecord, "status" | "closedAt">,
  now = new Date(),
): boolean {
  if (record.status !== "종료") return false;
  const closedAt = parseSheetDateTime(record.closedAt);
  return Boolean(closedAt && now.getTime() - closedAt.getTime() > CLOSED_HIDE_MS);
}

function monthKeyFromDate(value: string): string | null {
  const parsed = parseSheetDateTime(value);
  return parsed ? formatSheetDateTime(parsed).slice(0, 7) : null;
}

export function summarizeSpaceRentals(
  records: readonly SpaceRentalRecord[],
  monthKey: string,
): SpaceRentalSummary {
  const stageCounts = Object.fromEntries(
    SPACE_RENTAL_STAGES.map((stage) => [stage, 0]),
  ) as Record<SpaceRentalStage, number>;
  const summary = { monthKey, totalCount: 0, stageCounts };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return summary;

  for (const record of records) {
    if (monthKeyFromDate(record.receivedAt) !== monthKey) continue;
    summary.totalCount += 1;
    summary.stageCounts[record.status] += 1;
  }
  return summary;
}

export function getCurrentSpaceRentalMonth(now = new Date()): string {
  return getCurrentInquiryMonth(now);
}

export function formatSpaceRentalMonth(monthKey: string): string {
  return formatInquiryMonth(monthKey);
}

export function shiftSpaceRentalMonth(monthKey: string, offset: number): string {
  return shiftInquiryMonth(monthKey, offset);
}
