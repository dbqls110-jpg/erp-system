import { describe, expect, it } from "vitest";
import { projectFinanceStats } from "@/lib/projectFinanceStats";

const revenue = { kind: "revenue", amount: 1000, createdAt: new Date("2026-01-01T00:00:00Z") };

describe("프로젝트 통계 날짜 기준", () => {
  it("등록월 대신 실제 입금일·계산서 발행일·예정일 순으로 집계한다", () => {
    const result = projectFinanceStats([
      { ...revenue, paidDate: "2026-11-02", invoiceDate: "2026-10-01", expectedPaymentDate: "2026-09-01" },
      { ...revenue, paidDate: null, invoiceDate: "2026-10-01", expectedPaymentDate: "2026-09-01" },
      { ...revenue, paidDate: null, invoiceDate: null, expectedPaymentDate: "2026-09-01" },
    ], 2026);
    expect(result.monthlyData[0].revenue).toBe(0);
    for (const month of [8, 9, 10]) expect(result.monthlyData[month].revenue).toBe(1000);
    expect(result.totalRevenue).toBe(3000);
    expect(result.quarterlyData[3].revenue).toBe(2000);
  });
  it("미정 날짜를 등록일로 대체하지 않고 별도 건수·금액으로 남긴다", () => {
    const result = projectFinanceStats([revenue, { ...revenue, amount: 2244000, paidDate: null, invoiceDate: null, expectedPaymentDate: null }], 2026);
    expect(result.totalRevenue).toBe(0);
    expect(result.yearlyData).toEqual([]);
    expect(result.undatedRevenueCount).toBe(2);
    expect(result.undatedRevenueAmount).toBe(2245000);
  });
  it("매입만 있는 프로젝트도 한국시간 금액 등록일로 포함하고 연도를 분리한다", () => {
    const result = projectFinanceStats([
      { kind: "cost", amount: 500, createdAt: new Date("2025-12-31T15:00:00Z") },
      { kind: "cost", amount: 200, createdAt: new Date("2025-12-31T14:59:59Z") },
      { ...revenue, paidDate: "2027-01-01" },
    ], 2026);
    expect(result.totalCost).toBe(500);
    expect(result.totalProfit).toBe(-500);
    expect(result.monthlyData[0].cost).toBe(500);
    expect(result.yearlyData).toEqual([
      { label: "2025년", revenue: 0, cost: 200, profit: -200 },
      { label: "2026년", revenue: 0, cost: 500, profit: -500 },
      { label: "2027년", revenue: 1000, cost: 0, profit: 1000 },
    ]);
  });
  it("빈 자료와 집계 대상이 아닌 종류는 0원으로 표시한다", () => {
    const result = projectFinanceStats([{ ...revenue, kind: "card" }], 2026);
    expect(result.totalRevenue).toBe(0); expect(result.totalCost).toBe(0);
    expect(result.monthlyData).toHaveLength(12); expect(result.quarterlyData).toHaveLength(4);
    expect(result.undatedRevenueCount).toBe(0);
  });
});
