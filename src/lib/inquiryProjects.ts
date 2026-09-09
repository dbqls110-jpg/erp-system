import { parseSheetDateTime, type InquiryRecord } from "@/lib/inquiries";
import type { SpaceRentalRecord } from "@/lib/spaceRentals";

export interface CustomerConversionSeed {
  name: string;
  manager?: string | null;
  phone: string;
  email: string;
}

export interface ProjectConversionSeed {
  name: string;
  client: string;
  assignee: string;
  memo: string;
}

export interface ProjectCreateData {
  name: string;
  client: string | null;
  assignee: string | null;
  memo: string;
  status: "active";
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "") || normalizeText(value);
}

export function normalizeEmail(value: string): string {
  return normalizeText(value).toLowerCase();
}

export function inquiryProjectMarker(identity: InquiryRecord["identity"]): string {
  const submittedAt = parseSheetDateTime(identity.submittedAt)?.toISOString() ?? normalizeText(identity.submittedAt).toLowerCase();
  return [
    submittedAt,
    normalizeText(identity.name).toLowerCase(),
    normalizeEmail(identity.email),
    normalizePhone(identity.phone),
  ].join(" | ");
}

export function spaceRentalProjectMarker(rental: SpaceRentalRecord): string {
  return [
    normalizeText(rental.identity.category).toLowerCase(),
    normalizeText(rental.identity.reservationNumber).toLowerCase(),
    normalizeEmail(rental.identity.email),
  ].join(" | ");
}

export function buildInquiryProjectMemo(inquiry: InquiryRecord): string {
  // 접수 식별자와 원본 값을 메모에 남겨야 시트 저장이 실패한 뒤 재시도해도 같은 프로젝트를 찾을 수 있다.
  return [
    `문의 식별: ${inquiryProjectMarker(inquiry.identity)}`,
    `대관 유형: ${inquiry.rentalType || "-"}`,
    `희망 지역: ${inquiry.desiredArea || "-"}`,
    `대관 시작일: ${inquiry.rentalStartDate || "-"}`,
    `대관 종료일: ${inquiry.rentalEndDate || "-"}`,
    `일정 미정: ${inquiry.scheduleUndecided || "-"}`,
    `예상 최대 참석 인원: ${inquiry.expectedMaxAttendees || "-"}`,
    `총 대관 예산: ${inquiry.totalRentalBudget || "-"}`,
    `상담 후 예산: ${inquiry.budgetAfterConsultation || "-"}`,
    `선택 공간 ID: ${inquiry.selectedSpaceId || "-"}`,
    `선택 공간명: ${inquiry.selectedSpaceName || "-"}`,
    `선택 공간 지역: ${inquiry.selectedSpaceArea || "-"}`,
    `선택 공간 수용 인원: ${inquiry.selectedSpaceCapacity || "-"}`,
    `선택 공간 일일 대관료: ${inquiry.selectedSpaceDailyRate || "-"}`,
    `검색 조건: ${inquiry.searchCondition || "-"}`,
    `문의 내용: ${inquiry.content || "-"}`,
  ].join("\n");
}

export function buildSpaceRentalProjectMemo(rental: SpaceRentalRecord): string {
  return [
    `공간대관 식별: ${spaceRentalProjectMarker(rental)}`,
    `행사명: ${rental.eventName || "-"}`,
    `원청: ${rental.client || "-"}`,
    `예약자명: ${rental.reserverName || "-"}`,
    `대행사: ${rental.agency || "-"}`,
    `행사 유형: ${rental.eventType || "-"}`,
    `행사 일정: ${rental.schedule || "-"}`,
    `세부 시간: ${rental.detailTime || "-"}`,
    `장소: ${rental.venue || "-"}`,
    `서비스 유형: ${rental.serviceType || "-"}`,
    `인원: ${rental.attendees || "-"}`,
    `예산: ${rental.budget || "-"}`,
    `정산: ${rental.settlement || "-"}`,
    `견적: ${rental.quote || "-"}`,
    `문의 내용: ${rental.content || "-"}`,
  ].join("\n");
}

export function inquiryCustomerSeed(inquiry: InquiryRecord): CustomerConversionSeed {
  return {
    name: normalizeText(inquiry.name),
    phone: normalizeText(inquiry.phone),
    email: normalizeEmail(inquiry.email),
  };
}

export function spaceRentalCustomerSeed(rental: SpaceRentalRecord): CustomerConversionSeed {
  const client = normalizeText(rental.client);
  return {
    name: client || normalizeText(rental.reserverName),
    manager: client ? normalizeText(rental.reserverName) || null : null,
    phone: normalizeText(rental.phone),
    email: normalizeEmail(rental.email),
  };
}

export function inquiryProjectSeed(inquiry: InquiryRecord, requestedProjectName: string): ProjectConversionSeed {
  return {
    name: normalizeText(requestedProjectName),
    client: normalizeText(inquiry.name),
    assignee: normalizeText(inquiry.assignee),
    memo: buildInquiryProjectMemo(inquiry),
  };
}

export function spaceRentalProjectSeed(rental: SpaceRentalRecord, requestedProjectName: string): ProjectConversionSeed {
  const client = normalizeText(rental.client);
  const fallbackName = [client || normalizeText(rental.reserverName), normalizeText(rental.eventType)]
    .filter(Boolean)
    .join(" ") || "새 프로젝트";
  return {
    name: normalizeText(requestedProjectName) || normalizeText(rental.eventName) || fallbackName,
    client: client || normalizeText(rental.reserverName),
    assignee: normalizeText(rental.assignee),
    memo: buildSpaceRentalProjectMemo(rental),
  };
}

export function projectCreateData(seed: ProjectConversionSeed): ProjectCreateData {
  return {
    name: seed.name,
    client: seed.client || null,
    assignee: seed.assignee || null,
    memo: seed.memo,
    status: "active",
  };
}
