export interface BudgetMetrics {
  plannedExpense: number;
  remaining: number | null;
  usagePercent: number;
}

/** 사용자 지정 내부 관리 기준: 영업이익에서 19% 차감. 법정 세액 계산이 아니다. */
export const NET_INCOME_RATE = 0.81;

export function calculateOperatingProfit(revenue: number | null, cost: number | null): number | null {
  if (revenue === null || cost === null) return null;
  return revenue - cost;
}

/**
 * 당기순이익은 원 미만을 버린다.
 * 원본 견적서의 과거 세율 수식은 수정하지 않고 ERP 공통 정책을 적용한다.
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
    usagePercent: Math.round((plannedExpense / budget) * 100),
  };
}
