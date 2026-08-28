export interface BudgetMetrics {
  plannedExpense: number;
  remaining: number | null;
  usagePercent: number;
}
/** 카드·차트가 같은 기간과 같은 고정비 포함 기준을 사용하도록 계산을 한 곳에 둔다. */
export function calculateBudgetMetrics(
  budget: number | null,
  fixedExpense: number,
  otherExpense: number,
): BudgetMetrics {
  const plannedExpense = fixedExpense + otherExpense;
  if (budget === null || budget <= 0) {
    return { plannedExpense, remaining: budget === null ? null : budget - plannedExpense, usagePercent: 0 };
  }

  return {
    plannedExpense,
    remaining: budget - plannedExpense,
    usagePercent: Math.min(Math.round((plannedExpense / budget) * 100), 100),
  };
}
