import { describe, expect, it } from "vitest";
import { calculateBudgetMetrics } from "@/lib/financeMetrics";

describe("재무 예산 지표", () => {
  it("고정비와 기타 지출을 카드·차트 공통 기준으로 합산한다", () => {
    expect(calculateBudgetMetrics(100_000, 80_000, 12_000)).toEqual({
      plannedExpense: 92_000,
      remaining: 8_000,
      usagePercent: 92,
    });
  });

  it("예산이 없으면 잔여 예산은 미설정으로 두고 사용률은 0이다", () => {
    expect(calculateBudgetMetrics(null, 80_000, 12_000)).toEqual({
      plannedExpense: 92_000,
      remaining: null,
      usagePercent: 0,
    });
  });
});
