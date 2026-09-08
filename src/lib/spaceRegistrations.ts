import {
  formatInquiryMonth,
  formatSheetDateTime,
  getCurrentInquiryMonth,
  parseSheetDateTime,
  shiftInquiryMonth,
} from "@/lib/inquiries";

export const SPACE_REGISTRATION_STAGES = [
  "접수",
  "검토 중",
  "확인 완료",
  "등록 완료",
  "반려",
] as const;

export type SpaceRegistrationStage = (typeof SPACE_REGISTRATION_STAGES)[number];

export interface SpaceRegistrationIdentity {
  registrationId: string;
  receivedAt: string;
  contactName: string;
  relationship: string;
  phone: string;
  email: string;
  spaceName: string;
}

export interface SpaceRegistrationRecord {
  id: string;
  rowNumber: number;
  identity: SpaceRegistrationIdentity;
  registrationId: string;
  receivedAt: string;
  status: SpaceRegistrationStage;
  contactName: string;
  relationship: string;
  phone: string;
  email: string;
  spaceName: string;
  spaceType: string;
  address: string;
  desiredRegion: string;
  description: string;
  area: string;
  capacity: string;
  dailyRate: string;
  negotiable: string;
  conditions: string;
  photoFolderUrl: string;
  photoCount: string;
  privacyConsentAt: string;
  photoPermission: string;
  manager: string;
  memo: string;
  finalProcessedAt: string;
  reviewStartedAt: string;
  confirmationCompletedAt: string;
  registrationCompletedAt: string;
  rejectedAt: string;
}

export interface SpaceRegistrationRowMatch {
  rowNumber: number;
  values: string[];
}

export interface SpaceRegistrationSummary {
  monthKey: string;
  totalCount: number;
  stageCounts: Record<SpaceRegistrationStage, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HIGHLIGHT_MS = 24 * 60 * 60 * 1000;

function cell(value: unknown): string {
  return String(value ?? "").trim();
}

function column(values: readonly unknown[], index: number): string {
  return cell(values[index]);
}

function identityFromValues(values: readonly unknown[]): SpaceRegistrationIdentity {
  return {
    registrationId: column(values, 0),
    receivedAt: column(values, 1),
    contactName: column(values, 3),
    relationship: column(values, 4),
    phone: column(values, 5),
    email: column(values, 6),
    spaceName: column(values, 7),
  };
}

function normalizeText(value: string | null | undefined): string {
  // 시트 행은 뒤쪽 칸이 통째로 비어 오는 일이 흔하다. 그럴 때 여기서 터지면
  // "행을 못 찾았다" 가 아니라 알 수 없는 오류로 보여 원인을 짚기 어렵다.
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmail(value: string): string {
  return normalizeText(value);
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits || normalizeText(value);
}

function sameDate(left: string, right: string): boolean {
  const leftDate = parseSheetDateTime(left);
  const rightDate = parseSheetDateTime(right);
  if (leftDate && rightDate) return leftDate.getTime() === rightDate.getTime();
  return normalizeText(left) === normalizeText(right);
}

function sameFallbackIdentity(left: SpaceRegistrationIdentity, right: SpaceRegistrationIdentity): boolean {
  return (
    sameDate(left.receivedAt, right.receivedAt) &&
    normalizeText(left.contactName) === normalizeText(right.contactName) &&
    normalizeText(left.relationship) === normalizeText(right.relationship) &&
    normalizePhone(left.phone) === normalizePhone(right.phone) &&
    normalizeEmail(left.email) === normalizeEmail(right.email) &&
    normalizeText(left.spaceName) === normalizeText(right.spaceName)
  );
}

function hasFallbackIdentity(identity: SpaceRegistrationIdentity): boolean {
  return [
    identity.receivedAt,
    identity.contactName,
    identity.relationship,
    identity.phone,
    identity.email,
    identity.spaceName,
  ].filter((value) => normalizeText(value)).length >= 2;
}

export function isSpaceRegistrationStage(value: unknown): value is SpaceRegistrationStage {
  return typeof value === "string" && SPACE_REGISTRATION_STAGES.includes(value as SpaceRegistrationStage);
}

export function spaceRegistrationIdentityKey(identity: SpaceRegistrationIdentity): string {
  return [
    identity.registrationId,
    identity.receivedAt,
    identity.contactName,
    identity.relationship,
    identity.phone,
    identity.email,
    identity.spaceName,
  ].map(normalizeText).join("|");
}

export function parseSpaceRegistrationRows(
  rows: readonly (readonly unknown[])[],
): SpaceRegistrationRecord[] {
  return rows.slice(1).flatMap((values, index) => {
    const normalized = Array.from({ length: 28 }, (_, columnIndex) => column(values, columnIndex));
    if (!normalized.some(Boolean)) return [];

    const identity = identityFromValues(normalized);
    const rowNumber = index + 2;
    const status = isSpaceRegistrationStage(normalized[2]) ? normalized[2] : "접수";
    const id = identity.registrationId || `${spaceRegistrationIdentityKey(identity)}:${rowNumber}`;

    return [{
      id,
      rowNumber,
      identity,
      registrationId: normalized[0],
      receivedAt: normalized[1],
      status,
      contactName: normalized[3],
      relationship: normalized[4],
      phone: normalized[5],
      email: normalized[6],
      spaceName: normalized[7],
      spaceType: normalized[8],
      address: normalized[9],
      desiredRegion: normalized[10],
      description: normalized[11],
      area: normalized[12],
      capacity: normalized[13],
      dailyRate: normalized[14],
      negotiable: normalized[15],
      conditions: normalized[16],
      photoFolderUrl: normalized[17],
      photoCount: normalized[18],
      privacyConsentAt: normalized[19],
      photoPermission: normalized[20],
      manager: normalized[21],
      memo: normalized[22],
      finalProcessedAt: normalized[23],
      reviewStartedAt: normalized[24],
      confirmationCompletedAt: normalized[25],
      registrationCompletedAt: normalized[26],
      rejectedAt: normalized[27],
    }];
  });
}

/** 접수번호를 우선 쓰되, 접수번호가 비어 있는 예전 행은 여러 값으로 다시 확인한다. */
export function findSpaceRegistrationRows(
  rows: readonly (readonly unknown[])[],
  identity: SpaceRegistrationIdentity,
): SpaceRegistrationRowMatch[] {
  const requestedId = normalizeText(identity.registrationId);
  const canUseFallback = hasFallbackIdentity(identity);

  return rows.slice(1).flatMap((values, index) => {
    const candidate = identityFromValues(values);
    const matches = requestedId
      ? normalizeText(candidate.registrationId) === requestedId
      : canUseFallback && sameFallbackIdentity(candidate, identity);
    return matches
      ? [{ rowNumber: index + 2, values: Array.from({ length: 28 }, (_, columnIndex) => column(values, columnIndex)) }]
      : [];
  });
}

export function spaceRegistrationStageTimestamp(
  record: Pick<
    SpaceRegistrationRecord,
    "receivedAt" | "reviewStartedAt" | "confirmationCompletedAt" | "registrationCompletedAt" | "rejectedAt"
  >,
  stage: SpaceRegistrationStage,
): string {
  if (stage === "접수") return record.receivedAt;
  if (stage === "검토 중") return record.reviewStartedAt;
  if (stage === "확인 완료") return record.confirmationCompletedAt;
  if (stage === "등록 완료") return record.registrationCompletedAt;
  return record.rejectedAt;
}

export function getSpaceRegistrationAge(
  record: Pick<
    SpaceRegistrationRecord,
    "status" | "receivedAt" | "reviewStartedAt" | "confirmationCompletedAt" | "registrationCompletedAt" | "rejectedAt"
  >,
  now = new Date(),
): { overdue: boolean; dayLabel: string | null } {
  if (record.status === "등록 완료" || record.status === "반려") {
    return { overdue: false, dayLabel: null };
  }

  const startedAt = parseSheetDateTime(spaceRegistrationStageTimestamp(record, record.status));
  const elapsed = startedAt ? now.getTime() - startedAt.getTime() : 0;
  if (!startedAt || elapsed <= HIGHLIGHT_MS) return { overdue: false, dayLabel: null };
  return { overdue: true, dayLabel: `${Math.floor(elapsed / DAY_MS) + 1}일째` };
}

function monthKeyFromDate(value: string): string | null {
  const parsed = parseSheetDateTime(value);
  return parsed ? formatSheetDateTime(parsed).slice(0, 7) : null;
}

export function summarizeSpaceRegistrations(
  records: readonly SpaceRegistrationRecord[],
  monthKey: string,
): SpaceRegistrationSummary {
  const stageCounts = Object.fromEntries(
    SPACE_REGISTRATION_STAGES.map((stage) => [stage, 0]),
  ) as Record<SpaceRegistrationStage, number>;
  const summary = { monthKey, totalCount: 0, stageCounts };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return summary;

  for (const record of records) {
    if (monthKeyFromDate(record.receivedAt) !== monthKey) continue;
    summary.totalCount += 1;
    summary.stageCounts[record.status] += 1;
  }
  return summary;
}

export function getCurrentSpaceRegistrationMonth(now = new Date()): string {
  return getCurrentInquiryMonth(now);
}

export function formatSpaceRegistrationMonth(monthKey: string): string {
  return formatInquiryMonth(monthKey);
}

export function shiftSpaceRegistrationMonth(monthKey: string, offset: number): string {
  return shiftInquiryMonth(monthKey, offset);
}
