export interface PaymentLike {
  item: string;
  amount: number;
  unit: string;
  quantity: number;
  paidOn: string | null;
}

export interface RateLike {
  item: string;
  amount: number;
  unit: string;
}

export interface ItemStat {
  item: string;
  rate: number | null;
  unit: string;
  average: number | null;
  count: number;
  min: number | null;
  max: number | null;
  /** 등록 단가가 실제 평균과 얼마나 다른지 보여 주기 위한 비율이다. */
  ratio: number | null;
}

interface StatAccumulator {
  item: string;
  unit: string;
  rate: number | null;
  weightedAmount: number;
  count: number;
  min: number | null;
  max: number | null;
}

function getOrCreate(
  groups: Map<string, StatAccumulator>,
  item: string,
  unit: string,
): StatAccumulator {
  const key = `${item}\u0000${unit}`;
  const existing = groups.get(key);
  if (existing) return existing;

  const created: StatAccumulator = {
    item,
    unit,
    rate: null,
    weightedAmount: 0,
    count: 0,
    min: null,
    max: null,
  };
  groups.set(key, created);
  return created;
}

export function summarizeRates(rates: RateLike[], payments: PaymentLike[]): ItemStat[] {
  const groups = new Map<string, StatAccumulator>();

  for (const rate of rates) {
    const group = getOrCreate(groups, rate.item, rate.unit);
    if (group.rate === null) group.rate = rate.amount;
  }

  for (const payment of payments) {
    const group = getOrCreate(groups, payment.item, payment.unit);
    group.weightedAmount += payment.amount * payment.quantity;
    group.count += payment.quantity;
    group.min = group.min === null ? payment.amount : Math.min(group.min, payment.amount);
    group.max = group.max === null ? payment.amount : Math.max(group.max, payment.amount);
  }

  return [...groups.values()]
    .map((group) => {
      const average = group.count > 0 ? Math.round(group.weightedAmount / group.count) : null;
      const ratio =
        group.rate !== null && group.rate !== 0 && average !== null
          ? Math.round((average / group.rate) * 100) / 100
          : null;

      return {
        item: group.item,
        rate: group.rate,
        unit: group.unit,
        average,
        count: group.count,
        min: group.min,
        max: group.max,
        ratio,
      };
    })
    .sort((a, b) => b.count - a.count || a.item.localeCompare(b.item, "ko"));
}
