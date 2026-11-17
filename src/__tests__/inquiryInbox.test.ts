import { describe, expect, it } from "vitest";
import { parseInquiryRows } from "@/lib/inquiries";
import { parseSpaceRegistrationRows } from "@/lib/spaceRegistrations";
import { parseSpaceRentalRows } from "@/lib/spaceRentals";
import { buildInquiryInbox, maskInquiryBody, maskInquiryContact, summarizeInquiryInbox } from "@/lib/inquiryInbox";

const inquiries = parseInquiryRows([
  ["접수일시", "이름", "이메일", "연락처", "대관 유형", "지역", "문의 내용", "처리 상태"],
  ["2026-11-12 14:20", "홍길동", "hong@example.com", "010-1111-2222", "행사 대관", "서울", "행사 문의", "문의"],
  ["2026-10-01 14:20", "김고객", "kim@example.com", "010-2222-3333", "행사 대관", "서울", "예전 문의", "성사"],
]);
const registrationRow = Array.from({ length: 70 }, () => "");
registrationRow[0] = "V0001";
registrationRow[1] = "2026-11-13 09:00";
registrationRow[3] = "공간 담당자";
registrationRow[7] = "테스트 공간";
const rentalRow = Array.from({ length: 39 }, () => "");
rentalRow[0] = "In";
rentalRow[1] = "RSV-1";
rentalRow[2] = "2026-11-11";
rentalRow[4] = "대관 고객";
const registrations = parseSpaceRegistrationRows([[], registrationRow]);
const rentals = parseSpaceRentalRows([[], rentalRow]);

describe("통합 문의함", () => {
  it("원본을 수정하지 않고 세 종류를 같은 최신순 목록으로 만든다", () => {
    const before = JSON.stringify({ inquiries, registrations, rentals });
    const items = buildInquiryInbox({ inquiries, registrations, rentals });
    expect(items).toHaveLength(4);
    expect(items.map(item => item.branch)).toEqual(["space-registration", "customer", "space-rental", "customer"]);
    expect(new Set(items.map(item => item.key)).size).toBe(4);
    expect(JSON.stringify({ inquiries, registrations, rentals })).toBe(before);
  });
  it("최근 접수는 미래나 날짜 미정으로 채우지 않고 실제 날짜로만 센다", () => {
    const items = buildInquiryInbox({ inquiries, registrations, rentals });
    const summary = summarizeInquiryInbox(items, new Date("2026-11-13T10:00:00+09:00"));
    expect(summary).toMatchObject({ recent: 3, active: 3, completed: 1, waiting: 3 });
    const old = summarizeInquiryInbox(items, new Date("2026-10-05T10:00:00+09:00"));
    expect(old.recent).toBe(1);
    expect(summarizeInquiryInbox([], new Date()).recent).toBe(0);
  });
  it("없는 날짜는 현재 날짜로 바꾸지 않고 목록 뒤에 둔다", () => {
    const item = inquiries[0];
    expect(item).toBeDefined();
    if (!item) throw Error("fixture missing");
    const items = buildInquiryInbox({ inquiries: [{ ...item, id: "unknown", submittedAt: "" }, item], registrations: [], rentals: [] });
    expect(items[1]?.receivedTime).toBeNull();
    expect(items[1]?.receivedAt).toBe("");
  });
  it("가림은 표시 복사본에만 적용하고 원문에 알려진 개인정보도 가린다", () => {
    const item = { body: "홍길동입니다. hong@example.com, 010-1111-2222", name: "홍길동", email: "hong@example.com", phone: "010-1111-2222" };
    const redacted = maskInquiryBody(item);
    expect(redacted).not.toContain(item.email);
    expect(redacted).not.toContain(item.phone);
    expect(redacted).not.toContain(item.name);
    expect(item.body).toContain(item.email);
    expect(maskInquiryContact("")).toBe("미입력");
  });
});
