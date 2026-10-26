import { describe, expect, it } from "vitest";
import { parseProjectFilters, projectFiltersHref, projectFiltersWhere } from "@/lib/projectFilters";

describe("프로젝트 조회 필터", () => {
  it("기존 목록처럼 기본값은 전체 기간·회사·상태다", () => {
    const filters = parseProjectFilters({}, 2026);
    expect(filters).toEqual({ status: "all", company: "all", period: { kind: "all" } });
    expect(projectFiltersWhere(filters)).toEqual({ AND: [] });
    expect(projectFiltersHref(filters)).toBe("/projects");
  });

  it("연도·월·회사·상태를 함께 해석하고 상태 변경 링크에도 기간과 회사를 보존한다", () => {
    const filters = parseProjectFilters({ year: "2025", month: "09", company: "인포피아", status: "completed" }, 2026);
    expect(filters).toEqual({ status: "completed", company: "인포피아", period: { kind: "month", year: 2025, month: 9 } });
    const url = new URL(projectFiltersHref({ ...filters, status: "active" }), "https://erp.example");
    expect(Object.fromEntries(url.searchParams)).toEqual({ year: "2025", month: "9", company: "인포피아", status: "active" });
    expect(projectFiltersWhere(filters)).toEqual({ AND: [
      { status: "completed" }, { company: "인포피아" },
      { OR: [
        { deadline: { gte: "2025-09-01", lt: "2025-10-01" } },
        { AND: [
          { OR: [{ deadline: null }, { deadline: "" }] },
          { createdAt: { gte: new Date("2025-08-31T15:00:00Z"), lt: new Date("2025-09-30T15:00:00Z") } },
        ] },
      ] },
    ] });
  });

  it("월만 선택하면 올해의 해당 월을 조회한다", () => {
    expect(parseProjectFilters({ month: "10" }, 2026).period).toEqual({ kind: "month", year: 2026, month: 10 });
  });

  it.each(["13", "0", "-1", "1.5", "1x", ["1", "2"]])("잘못된 월 %j은 전체 월로 처리한다", month => {
    expect(parseProjectFilters({ year: "2026", month }, 2026).period).toEqual({ kind: "year", year: 2026 });
  });

  it.each(["1999", "2101", "2026oops", ["2025", "2026"]])("잘못된 연도 %j는 전체 기간으로 처리한다", year => {
    expect(parseProjectFilters({ year, status: ["active", "completed"], company: ["인포피아", "노바웨이"] }, 2026))
      .toEqual({ status: "all", company: "all", period: { kind: "all" } });
  });

  it.each([
    [{ year: "2024", month: "2" }, "2024-02-01", "2024-03-01"],
    [{ year: "2026", month: "12" }, "2026-12-01", "2027-01-01"],
    [{ year: "2026" }, "2026-01-01", "2027-01-01"],
  ])("기간 %j는 다음 기간 시작 직전까지 조회한다", (params, start, end) => {
    expect(projectFiltersWhere(parseProjectFilters(params, 2026))).toMatchObject({ AND: [{ OR: [
      { deadline: { gte: start, lt: end } },
      { AND: [
        { OR: [{ deadline: null }, { deadline: "" }] },
        { createdAt: { gte: new Date(`${start}T00:00:00+09:00`), lt: new Date(`${end}T00:00:00+09:00`) } },
      ] },
    ] }] });
  });

  it("미배정에는 빈 값·기존 비표준 회사명도 포함된다", () => {
    expect(projectFiltersWhere(parseProjectFilters({ company: "unassigned" }, 2026))).toEqual({ AND: [
      { OR: [{ company: null }, { company: { notIn: ["인포피아", "노바웨이", "클로원"] } }] },
    ] });
  });
});
