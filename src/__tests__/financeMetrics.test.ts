import { describe, expect, it } from "vitest";
import { calculateBudgetMetrics, calculateCompanyNetIncome, calculateNetIncome } from "@/lib/financeMetrics";

describe("회사·프로젝트 공통 관리상 순이익", () => {
  it("카드가 없으면 프로젝트의 19% 차감과 같다", () => {
    expect(calculateCompanyNetIncome({ revenue: 2240750, cost: 1626900, card: 0 })).toBe(calculateNetIncome(2240750, 1626900));
    expect(calculateCompanyNetIncome({ revenue: 2240750, cost: 1626900, card: 0 })).toBe(497218);
  });
  it("카드는 매입이나 19% 차감 기준에 섞지 않고 마지막에 뺀다", () => {
    expect(calculateCompanyNetIncome({ revenue: 251000, cost: 50000, card: 20000 })).toBe(142810);
  });
  it("원 미만과 적자도 같은 규칙으로 계산한다", () => {
    expect(calculateCompanyNetIncome({ revenue: 101, cost: 0, card: 1 })).toBe(80);
    expect(calculateCompanyNetIncome({ revenue: 0, cost: 101, card: 1 })).toBe(-82);
    expect(calculateCompanyNetIncome({ revenue: 0, cost: 0, card: 0 })).toBe(0);
  });
});

describe("재무 예산 지표", () => {
  it("초과 사용률은 숫자에서 숨기지 않는다", () => {
    expect(calculateBudgetMetrics(1_300_000, 1_297_000, 141_000)).toEqual({
      plannedExpense: 1_438_000, remaining: -138_000, usagePercent: 111,
    });
  });
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
