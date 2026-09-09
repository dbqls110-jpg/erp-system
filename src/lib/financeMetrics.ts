export interface BudgetMetrics {
  plannedExpense: number;
  remaining: number | null;
  usagePercent: number;
}

/** 영업이익에서 당기순이익으로 남는 비율. 표본 엑셀의 "영업이익 -21%"와 같다. */
export const NET_INCOME_RATE = 0.79;

export function calculateOperatingProfit(revenue: number | null, cost: number | null): number | null {
  if (revenue === null || cost === null) return null;
  return revenue - cost;
}

/**
 * 당기순이익은 원 미만을 버린다.
 * 표본의 613,850 × 0.79가 표시되는 방식(484,941원)에 맞춘다.
 */
export function calculateNetIncome(revenue: number | null, cost: number | null): number | null {
  const operatingProfit = calculateOperatingProfit(revenue, cost);
  return operatingProfit === null ? null : Math.trunc(operatingProfit * NET_INCOME_RATE);
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
