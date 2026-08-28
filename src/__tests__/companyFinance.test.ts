import { describe, expect, it } from "vitest";
import { normalizeCompany, summarizeCompanyFinance, summarizeCompanyFinanceEntries } from "@/lib/companyFinance";

describe("회사별 분기 매출·매입 집계", () => {
  it("회사와 생성일 기준으로 분기별 금액을 합산한다", () => {
    const result = summarizeCompanyFinance([
      { company: "인포피아", revenue: 1_000_000, cost: 300_000, createdAt: "2026-01-15T12:00:00Z" },
      { company: "인포피아", revenue: 500_000, cost: 100_000, createdAt: "2026-04-15T12:00:00Z" },
      { company: "노바웨이", revenue: 700_000, cost: null, createdAt: "2026-08-15T12:00:00Z" },
    ], 2026);

    expect(result.summaries[0].quarters[1]).toMatchObject({ revenue: 1_000_000, cost: 300_000, profit: 700_000, projectCount: 1 });
    expect(result.summaries[0].quarters[2]).toMatchObject({ revenue: 500_000, cost: 100_000, profit: 400_000, projectCount: 1 });
    expect(result.summaries[1].quarters[3]).toMatchObject({ revenue: 700_000, cost: 0, profit: 700_000, projectCount: 1 });
  });

  it("조회 연도 밖의 프로젝트는 제외한다", () => {
    const result = summarizeCompanyFinance([
      { company: "클로원", revenue: 1_000, cost: 200, createdAt: "2025-12-31T12:00:00Z" },
      { company: "클로원", revenue: 2_000, cost: 300, createdAt: "2026-12-31T12:00:00Z" },
    ], 2026);

    expect(result.summaries[2].revenue).toBe(2_000);
    expect(result.summaries[2].cost).toBe(300);
    expect(result.summaries[2].projectCount).toBe(1);
  });

  it("회사 미지정 금액은 별도로 모은다", () => {
    const result = summarizeCompanyFinance([
      { company: null, revenue: 300_000, cost: 80_000, createdAt: "2026-02-01T12:00:00Z" },
      { company: "기타", revenue: 200_000, cost: 50_000, createdAt: "2026-03-01T12:00:00Z" },
    ], 2026);

    expect(result.unassigned).toEqual({ revenue: 500_000, cost: 130_000, profit: 370_000, projectCount: 2 });
    expect(result.summaries.every((summary) => summary.projectCount === 0)).toBe(true);
  });

  it("회사 입력값은 지정된 세 회사만 허용한다", () => {
    expect(normalizeCompany(" 인포피아 ")).toBe("인포피아");
    expect(normalizeCompany("기타 회사")).toBeNull();
    expect(normalizeCompany(null)).toBeNull();
  });

  it("프로젝트와 분리된 직접 등록 장부만 매출·매입으로 집계한다", () => {
    const result = summarizeCompanyFinanceEntries([
      { company: "인포피아", type: "revenue", amount: 1_000_000, date: "2026-02-10" },
      { company: "인포피아", type: "cost", amount: 250_000, date: "2026-05-10" },
      { company: "노바웨이", type: "revenue", amount: 700_000, date: "2025-12-31" },
    ], 2026);

    expect(result.summaries[0].quarters[1]).toMatchObject({ revenue: 1_000_000, cost: 0, projectCount: 1 });
    expect(result.summaries[0].quarters[2]).toMatchObject({ revenue: 0, cost: 250_000, profit: -250_000, projectCount: 1 });
    expect(result.summaries[1].revenue).toBe(0);
    expect(result.unassigned.projectCount).toBe(0);
  });
});
