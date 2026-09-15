import { koreanDateKey } from "@/lib/dateFormat";

export const COMPANY_NAMES = ["인포피아", "노바웨이", "클로원"] as const;

export type CompanyName = (typeof COMPANY_NAMES)[number];
export type CompanyFinanceEntryType = "revenue" | "cost";

export interface CompanyFinanceProject {
  company: string | null;
  revenue: number | null;
  cost: number | null;
  createdAt: Date | string;
}

export interface CompanyFinanceEntryRecord {
  company: string;
  type: CompanyFinanceEntryType;
  amount: number;
  date: Date | string;
}

export interface CompanyFinanceRecord {
  company: string | null;
  type: CompanyFinanceEntryType;
  amount: number;
  date: Date | string;
}

export interface QuarterFinance {
  revenue: number;
  cost: number;
  profit: number;
  projectCount: number;
}

export interface CompanyFinanceSummary {
  company: CompanyName;
  quarters: Record<1 | 2 | 3 | 4, QuarterFinance>;
  revenue: number;
  cost: number;
  profit: number;
  projectCount: number;
}

export interface UnassignedFinanceSummary {
  revenue: number;
  cost: number;
  profit: number;
  projectCount: number;
}

const QUARTERS = [1, 2, 3, 4] as const;

interface FinanceAggregateItem {
  company: string | null;
  date: Date | string;
  revenue: number | null;
  cost: number | null;
}

function emptyQuarter(): QuarterFinance {
  return { revenue: 0, cost: 0, profit: 0, projectCount: 0 };
}

function emptyQuarters(): Record<1 | 2 | 3 | 4, QuarterFinance> {
  return { 1: emptyQuarter(), 2: emptyQuarter(), 3: emptyQuarter(), 4: emptyQuarter() };
}

function isCompanyName(value: string | null): value is CompanyName {
  return value !== null && (COMPANY_NAMES as readonly string[]).includes(value);
}

function addAmounts(target: QuarterFinance, revenue: number | null, cost: number | null) {
  target.revenue += revenue ?? 0;
  target.cost += cost ?? 0;
  target.profit = target.revenue - target.cost;
  target.projectCount += 1;
}

function createSummaries() {
  const summaries = COMPANY_NAMES.map((company) => ({
    company,
    quarters: emptyQuarters(),
    revenue: 0,
    cost: 0,
    profit: 0,
    projectCount: 0,
  } satisfies CompanyFinanceSummary));
  return {
    summaries,
    summaryByCompany: new Map(summaries.map((summary) => [summary.company, summary])),
    unassigned: { revenue: 0, cost: 0, profit: 0, projectCount: 0 } satisfies UnassignedFinanceSummary,
  };
}

export function getYearQuarter(value: Date | string) {
  const key = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : koreanDateKey(value);
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(key);
  if (!match) return null;

  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), quarter: Math.ceil(month / 3) as 1 | 2 | 3 | 4 };
}

function addToSummary(
  summary: CompanyFinanceSummary,
  quarter: 1 | 2 | 3 | 4,
  revenue: number | null,
  cost: number | null,
) {
  addAmounts(summary.quarters[quarter], revenue, cost);
  summary.revenue += revenue ?? 0;
  summary.cost += cost ?? 0;
  summary.profit = summary.revenue - summary.cost;
  summary.projectCount += 1;
}

function addToUnassigned(
  unassigned: UnassignedFinanceSummary,
  revenue: number | null,
  cost: number | null,
) {
  unassigned.revenue += revenue ?? 0;
  unassigned.cost += cost ?? 0;
  unassigned.profit = unassigned.revenue - unassigned.cost;
  unassigned.projectCount += 1;
}

function summarizeItems(items: FinanceAggregateItem[], year: number) {
  const { summaries, summaryByCompany, unassigned } = createSummaries();

  for (const item of items) {
    const date = getYearQuarter(item.date);
    if (!date || date.year !== year) continue;

    const summary = isCompanyName(item.company) ? summaryByCompany.get(item.company) : undefined;
    if (summary) {
      addToSummary(summary, date.quarter, item.revenue, item.cost);
    } else {
      addToUnassigned(unassigned, item.revenue, item.cost);
    }
  }

  return { summaries, unassigned };
}

export function summarizeCompanyFinance(projects: CompanyFinanceProject[], year: number) {
  return summarizeItems(
    projects.map((project) => ({
      company: project.company,
      date: project.createdAt,
      revenue: project.revenue,
      cost: project.cost,
    })),
    year,
  );
}

export function summarizeCompanyFinanceEntries(entries: CompanyFinanceEntryRecord[], year: number) {
  return summarizeItems(
    entries.map((entry) => ({
      company: entry.company,
      date: entry.date,
      revenue: entry.type === "revenue" ? entry.amount : null,
      cost: entry.type === "cost" ? entry.amount : null,
    })),
    year,
  );
}

export function summarizeCompanyFinanceRecords(records: CompanyFinanceRecord[], year: number) {
  return summarizeItems(
    records.map((record) => ({
      company: record.company,
      date: record.date,
      revenue: record.type === "revenue" ? record.amount : null,
      cost: record.type === "cost" ? record.amount : null,
    })),
    year,
  );
}

export function normalizeCompany(value: unknown): CompanyName | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return isCompanyName(normalized) ? normalized : null;
}

export { QUARTERS };
