import { describe, expect, it } from "vitest";
import {
  findInquiryRows,
  getInquiryClosePoint,
  getCurrentInquiryMonth,
  getFollowupAge,
  hasSelectedSpace,
  parseInquiryRows,
  parseSheetDateTime,
  shouldHideInquiry,
  shiftInquiryMonth,
  summarizeInquiries,
  type InquiryIdentity,
} from "@/lib/inquiries";

const NOW = new Date("2026-09-05T14:21:00+09:00");

const identity: InquiryIdentity = {
  submittedAt: "2026-09-03 14:20",
  name: "홍길동",
  email: "hong@example.com",
  phone: "010-1234-5678",
};

describe("문의 칸반 순수 로직", () => {
  it("빈 상태와 잘못된 상태를 문의 단계로 판정한다", () => {
    const records = parseInquiryRows([
      ["접수일시", "이름", "이메일", "연락처", "처리 상태"],
      ["2026-09-03 14:20", "홍길동", "hong@example.com", "010-1234-5678", ""],
      ["2026-09-03 15:20", "김철수", "kim@example.com", "010-2222-3333", "알 수 없는 값"],
    ]);

    expect(records.map((record) => record.status)).toEqual(["문의", "문의"]);
  });

  it("접수일시·이름·이메일·연락처가 같은 행만 다시 찾는다", () => {
    const rows = [
      ["접수일시", "이름", "이메일", "연락처"],
      ["2026. 9. 3 오후 2:20:00", "홍길동", "HONG@example.com", "010 1234 5678"],
      ["2026-09-03 14:20", "홍길동", "other@example.com", "010-1234-5678"],
    ];

    expect(findInquiryRows(rows, identity).map((match) => match.rowNumber)).toEqual([2]);
  });

  it("동일한 식별자가 여러 행이면 어느 행도 고르지 않는다", () => {
    const rows = [
      ["접수일시", "이름", "이메일", "연락처"],
      [identity.submittedAt, identity.name, identity.email, identity.phone],
      [identity.submittedAt, identity.name, identity.email, identity.phone],
    ];

    expect(findInquiryRows(rows, identity)).toHaveLength(2);
  });

  it("한국 시간 문자열을 파싱하고 48시간 초과를 3일째로 표시한다", () => {
    expect(parseSheetDateTime("2026. 9. 3 오후 2:20:00")).not.toBeNull();
    const record = parseInquiryRows([
      ["접수일시", "이름", "이메일", "연락처", "대관 유형", "희망 지역", "문의 내용", "처리 상태", "담당자", "메모", "1차 연락일시"],
      ["접수일시", "이름", "이메일", "연락처", "", "", "", "1차 연락", "", "", "2026-09-03 14:20"],
    ])[0];

    expect(getFollowupAge(record, NOW)).toEqual({ overdue: true, dayLabel: "3일째" });
    expect(getFollowupAge({ ...record, contact1At: "2026-09-03 14:21" }, NOW).overdue).toBe(false);
    expect(getFollowupAge({ ...record, status: "성사", wonAt: "2026-09-03 14:20" }, NOW)).toEqual({ overdue: false, dayLabel: null });
  });

  it("종료 48시간 초과만 숨기고 종료가 아닌 카드는 남긴다", () => {
    const closed = { status: "종료" as const, closedAt: "2026-09-03 14:20" };
    expect(shouldHideInquiry(closed, NOW)).toBe(true);
    // 정확히 48시간이면 아직 남는다. 경계에서 하루 일찍 사라지면 사람이 놓친다.
    expect(shouldHideInquiry({ ...closed, closedAt: "2026-09-03 14:21" }, NOW)).toBe(false);
    expect(shouldHideInquiry({ status: "문의" as const, closedAt: closed.closedAt }, NOW)).toBe(false);
    expect(shouldHideInquiry({ status: "성사" as const, closedAt: closed.closedAt }, NOW)).toBe(false);
  });

  it("종료 카드를 연락 전·1차·2차 이탈로 구분한다", () => {
    expect(getInquiryClosePoint({ contact1At: "", contact2At: "" })).toBe("연락 전");
    expect(getInquiryClosePoint({ contact1At: "2026-09-01 10:00", contact2At: "" })).toBe("1차");
    expect(getInquiryClosePoint({ contact1At: "2026-09-01 10:00", contact2At: "2026-09-02 10:00" })).toBe("2차");
  });

  it("27열 문의 행의 홈페이지 폼 필드를 읽는다", () => {
    const values = Array.from({ length: 27 }, () => "");
    values[0] = "2026-09-05 10:00";
    values[1] = "홍길동";
    values[2] = "hong@example.com";
    values[3] = "010-1234-5678";
    values[15] = "2026-10-01";
    values[16] = "2026-10-02";
    values[17] = "아니오";
    values[18] = "120";
    values[19] = "500";
    values[20] = "아니오";
    values[21] = "space-123";
    values[22] = "코너 아카이브";
    values[23] = "연남·서울";
    values[24] = "120";
    values[25] = "290";
    values[26] = "120명, 연남, 500만원";

    const record = parseInquiryRows([Array.from({ length: 27 }, () => "헤더"), values])[0];

    expect(record).toMatchObject({
      rentalStartDate: "2026-10-01",
      rentalEndDate: "2026-10-02",
      scheduleUndecided: "아니오",
      expectedMaxAttendees: "120",
      totalRentalBudget: "500",
      budgetAfterConsultation: "아니오",
      selectedSpaceId: "space-123",
      selectedSpaceName: "코너 아카이브",
      selectedSpaceArea: "연남·서울",
      selectedSpaceCapacity: "120",
      selectedSpaceDailyRate: "290",
      searchCondition: "120명, 연남, 500만원",
    });
  });

  it("15열까지만 있는 옛 문의 행은 새 필드를 빈 값으로 채운다", () => {
    const values = Array.from({ length: 15 }, () => "");
    values[0] = "2026-09-05 10:00";
    values[1] = "홍길동";
    values[2] = "hong@example.com";
    values[3] = "010-1234-5678";

    const record = parseInquiryRows([Array.from({ length: 15 }, () => "헤더"), values])[0];

    expect(record).toBeDefined();
    expect(record).toMatchObject({
      rentalStartDate: "",
      rentalEndDate: "",
      scheduleUndecided: "",
      expectedMaxAttendees: "",
      totalRentalBudget: "",
      budgetAfterConsultation: "",
      selectedSpaceId: "",
      selectedSpaceName: "",
      selectedSpaceArea: "",
      selectedSpaceCapacity: "",
      selectedSpaceDailyRate: "",
      searchCondition: "",
    });
  });

  it("선택 공간명이 없으면 선택 공간 묶음을 숨긴다", () => {
    expect(hasSelectedSpace({ selectedSpaceName: "" })).toBe(false);
    expect(hasSelectedSpace({ selectedSpaceName: "코너 아카이브" })).toBe(true);
  });

  it("접수일시가 선택한 월과 같은 문의만 연락 퍼널과 이탈을 집계한다", () => {
    const row = (date: string, status: string, contact1At = "", contact2At = "", wonAt = "") => {
      const values = Array.from({ length: 15 }, () => "");
      values[0] = date;
      values[1] = "홍길동";
      values[2] = `${date}@example.com`;
      values[3] = "010-1234-5678";
      values[7] = status;
      values[10] = contact1At;
      values[11] = contact2At;
      values[14] = wonAt;
      return values;
    };
    const records = parseInquiryRows([
      Array.from({ length: 15 }, () => "헤더"),
      row("2026-09-01 10:00", "성사", "2026-09-01 11:00", "2026-09-02 11:00", "2026-09-04 11:00"),
      row("2026-09-02 10:00", "종료", "2026-09-02 11:00"),
      row("2026-09-03 10:00", "종료"),
      row("2026-09-04 10:00", "종료", "2026-09-04 11:00", "2026-09-05 11:00"),
      row("2026-08-31 10:00", "성사", "2026-08-31 11:00", "", "2026-08-31 12:00"),
    ]);

    expect(summarizeInquiries(records, "2026-09")).toEqual({
      monthKey: "2026-09",
      inquiryCount: 4,
      contact1Count: 3,
      contact2Count: 2,
      wonCount: 1,
      dropOff: { "연락 전": 1, "1차": 1, "2차": 1 },
    });
    expect(getCurrentInquiryMonth(new Date("2026-08-31T14:59:00Z"))).toBe("2026-08");
    expect(getCurrentInquiryMonth(new Date("2026-08-31T15:00:00Z"))).toBe("2026-09");
    expect(shiftInquiryMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftInquiryMonth("2025-12", 1)).toBe("2026-01");
  });
});
