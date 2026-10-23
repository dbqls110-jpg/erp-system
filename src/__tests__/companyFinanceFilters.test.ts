import { describe, expect, it } from "vitest";
import { companyFinanceFilterLabel, companyFinanceHref, companyFinanceWhere, parseCompanyFinanceFilters } from "@/lib/companyFinanceFilters";

describe("회사 재무 조회 필터", () => {
  it("기본값은 올해·전체 회사·전체 월이다", () => {
    expect(parseCompanyFinanceFilters({}, 2026)).toEqual({ year: 2026, month: null, company: "all" });
  });

  it("회사·연도·월을 함께 해석하고 링크로 보존한다", () => {
    const filters = parseCompanyFinanceFilters({ year: "2025", month: "09", company: "인포피아" }, 2026);
    expect(filters).toEqual({ year: 2025, month: 9, company: "인포피아" });
    const url = new URL(companyFinanceHref({ ...filters, year: 2024 }), "https://erp.example");
    expect(Object.fromEntries(url.searchParams)).toEqual({ year: "2024", month: "9", company: "인포피아" });
    expect(companyFinanceFilterLabel(filters)).toBe("인포피아 · 2025년 9월");
  });

  it.each(["13", "0", "-1", "1x", "1.5", "Infinity", ["1", "2"]])("잘못되거나 중복된 월 %j은 전체 월로 처리한다", (month) => {
    expect(parseCompanyFinanceFilters({ month }, 2026).month).toBeNull();
  });

  it.each(["1999", "2101", "2025oops", ["2024", "2025"]])("잘못된 연도 %j는 올해로 처리한다", (year) => {
    expect(parseCompanyFinanceFilters({ year, company: ["인포피아", "노바웨이"] }, 2026)).toEqual({ year: 2026, company: "all", month: null });
  });

  it("두 장부에 같은 회사·월의 조건을 적용한다", () => {
    const where = companyFinanceWhere({ year: 2026, month: 9, company: "노바웨이" });
    expect(where.entries).toEqual({ company: "노바웨이", date: { gte: "2026-09-01", lt: "2026-10-01" } });
    expect(where.projectAmounts).toEqual({
      project: { company: "노바웨이" },
      createdAt: { gte: new Date("2026-08-31T15:00:00Z"), lt: new Date("2026-09-30T15:00:00Z") },
    });
  });

  it("윤년 2월·12월·전체 연도의 끝은 다음 기간 시작으로 계산한다", () => {
    expect(companyFinanceWhere({ year: 2024, month: 2, company: "all" }).entries.date).toEqual({ gte: "2024-02-01", lt: "2024-03-01" });
    expect(companyFinanceWhere({ year: 2026, month: 12, company: "all" }).entries.date).toEqual({ gte: "2026-12-01", lt: "2027-01-01" });
    expect(companyFinanceWhere({ year: 2026, month: null, company: "all" }).projectAmounts).toEqual({ createdAt: {
      gte: new Date("2025-12-31T15:00:00Z"), lt: new Date("2026-12-31T15:00:00Z"),
    } });
  });

  it("미배정에는 null과 알려지지 않은 회사가 포함된다", () => {
    const filters = parseCompanyFinanceFilters({ company: "unassigned" }, 2026);
    const where = companyFinanceWhere(filters);
    expect(where.entries.company).toEqual({ notIn: ["인포피아", "노바웨이", "클로원"] });
    expect(where.projectAmounts.project).toEqual({ OR: [
      { company: null }, { company: { notIn: ["인포피아", "노바웨이", "클로원"] } },
    ] });
    expect(companyFinanceFilterLabel(filters)).toBe("미배정 · 2026년 전체 월");
  });
});
