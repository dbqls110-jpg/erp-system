import { describe, expect, it } from "vitest";
import { calculateBudgetMetrics } from "@/lib/financeMetrics";
import { previousMonthKey } from "@/lib/fixedExpenseMonths";

describe("지난달 마감 계산", () => {
  it("1월을 보면 전년 12월을 계산하고 예산이 없으면 잔액을 null로 둔다", () => {
    const previousMonth = previousMonthKey("2026-01");
    const withBudget = calculateBudgetMetrics(1_300_000, 738_200, 210_000);
    const withoutBudget = calculateBudgetMetrics(null, 738_200, 210_000);

    expect(previousMonth).toBe("2025-12");
    expect(withBudget.remaining).toBe(351_800);
    expect(withoutBudget.remaining).toBeNull();
  });
});
