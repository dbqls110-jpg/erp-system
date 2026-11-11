import { koreanDateKey } from "@/lib/dateFormat";
import { resolveRevenueDate, type RevenueDates } from "@/lib/revenueDates";

type Amount = Partial<RevenueDates> & {
  kind: string;
  amount: number;
  createdAt: Date | string;
};
type Totals = { revenue: number; cost: number };
const empty = (): Totals => ({ revenue: 0, cost: 0 });
const point = (label: string, totals: Totals) => ({ ...totals, label, profit: totals.revenue - totals.cost });

/** Revenue follows its explicit date; costs retain the ledger's KST registration date. */
export function projectFinanceStats(amounts: Amount[], year: number) {
  const months = Array.from({ length: 12 }, empty);
  const quarters = Array.from({ length: 4 }, empty);
  const years = new Map<number, Totals>();
  let undatedRevenueCount = 0;
  let undatedRevenueAmount = 0;
  for (const amount of amounts) {
    if (amount.kind !== "revenue" && amount.kind !== "cost") continue;
    const date = amount.kind === "revenue" ? resolveRevenueDate(amount).date : koreanDateKey(amount.createdAt);
    if (!date) {
      undatedRevenueCount++;
      undatedRevenueAmount += amount.amount;
      continue;
    }
    const itemYear = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7)) - 1;
    const annual = years.get(itemYear) ?? empty();
    annual[amount.kind] += amount.amount;
    years.set(itemYear, annual);
    if (itemYear === year) {
      months[month][amount.kind] += amount.amount;
      quarters[Math.floor(month / 3)][amount.kind] += amount.amount;
    }
  }
  const total = years.get(year) ?? empty();
  return {
    monthlyData: months.map((value, index) => point(`${index + 1}월`, value)),
    quarterlyData: quarters.map((value, index) => point(`${index + 1}분기`, value)),
    yearlyData: [...years].sort(([a], [b]) => a - b).map(([key, value]) => point(`${key}년`, value)),
    totalRevenue: total.revenue, totalCost: total.cost, totalProfit: total.revenue - total.cost,
    undatedRevenueCount, undatedRevenueAmount,
  };
}
