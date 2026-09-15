import { describe, expect, it } from "vitest";
import { summarizeCompanyFinanceRecords } from "@/lib/companyFinance";

describe("프로젝트 금액 회사 재무 집계", () => {
  it("회사·분기별로 매출과 매입을 합친다", () => {
    const result = summarizeCompanyFinanceRecords([
      { company: "인포피아", type: "revenue", amount: 1_000_000, date: "2026-07-01T00:00:00Z" },
      { company: "인포피아", type: "cost", amount: 300_000, date: "2026-08-01T00:00:00Z" },
      { company: "노바웨이", type: "revenue", amount: 700_000, date: "2026-09-01T00:00:00Z" },
    ], 2026);

    expect(result.summaries[0].quarters[3]).toMatchObject({
      revenue: 1_000_000,
      cost: 300_000,
      profit: 700_000,
      projectCount: 2,
    });
    expect(result.summaries[1].quarters[3]).toMatchObject({ revenue: 700_000, cost: 0, projectCount: 1 });
  });

  it("company가 null이면 미배정으로 합친다", () => {
    const result = summarizeCompanyFinanceRecords([
      { company: null, type: "revenue", amount: 300_000, date: "2026-09-10T00:00:00Z" },
      { company: null, type: "cost", amount: 80_000, date: "2026-09-11T00:00:00Z" },
    ], 2026);

    expect(result.unassigned).toEqual({ revenue: 300_000, cost: 80_000, profit: 220_000, projectCount: 2 });
    expect(result.summaries.every((summary) => summary.projectCount === 0)).toBe(true);
  });

  it("8월 31일 23시 UTC는 한국 시간 9월 1일로 3분기다", () => {
    const result = summarizeCompanyFinanceRecords([
      { company: "클로원", type: "revenue", amount: 500_000, date: "2026-08-31T23:00:00Z" },
    ], 2026);

    expect(result.summaries[2].quarters[3]).toMatchObject({ revenue: 500_000, projectCount: 1 });
    expect(result.summaries[2].quarters[2].revenue).toBe(0);
  });
});
