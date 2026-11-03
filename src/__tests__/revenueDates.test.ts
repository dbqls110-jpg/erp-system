import { describe, expect, it } from "vitest";
import { parseRevenueDates, resolveRevenueDate, revenueDatesFromForm } from "@/lib/revenueDates";

describe("매출 집계일", () => {
  it("예정일·발행일·입금일 변경에 따라 집계 월이 이동한다", () => {
    const dates = parseRevenueDates({ expectedPaymentDate: "2026-11-20" });
    expect(resolveRevenueDate(dates)).toEqual({ date: "2026-11-20", label: "입금 예정일" });
    const issued = { ...dates, invoiceDate: "2026-12-03" };
    expect(resolveRevenueDate(issued)).toEqual({ date: "2026-12-03", label: "계산서 발행일" });
    expect(resolveRevenueDate({ ...issued, paidDate: "2027-01-04" })).toEqual({ date: "2027-01-04", label: "실제 입금일" });
  });
  it("기존 발생일은 보존하지만 프로젝트 등록일을 입금일로 추측하지 않는다", () => {
    expect(resolveRevenueDate({}, "2026-09-10")).toEqual({ date: "2026-09-10", label: "기존 발생일" });
    expect(resolveRevenueDate({})).toEqual({ date: null, label: "날짜 미정" });
    expect(resolveRevenueDate({}, "")).toEqual({ date: null, label: "날짜 미정" });
  });
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "2026-10-01T12:00:00Z", "1899-12-31", "2201-01-01", 123])("잘못된 날짜 %j를 거부한다", value => {
    expect(() => parseRevenueDates({ paidDate: value })).toThrow();
  });
  it("윤일·연말 날짜는 시간대 변환 없이 보존한다", () => {
    expect(parseRevenueDates({ invoiceDate: "2024-02-29", paidDate: "2026-12-31" })).toEqual({ invoiceDate: "2024-02-29", paidDate: "2026-12-31", expectedPaymentDate: null });
  });
  it("빈 날짜는 미정으로 저장한다", () => {
    const form = new FormData(); form.set("expectedPaymentDate", "");
    expect(revenueDatesFromForm(form)).toEqual({ paidDate: null, invoiceDate: null, expectedPaymentDate: null });
  });
});
