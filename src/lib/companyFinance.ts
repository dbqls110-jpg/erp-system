export const COMPANY_NAMES = ["인포피아", "노바웨이", "클로원"] as const;

export type CompanyName = (typeof COMPANY_NAMES)[number];

export interface CompanyFinanceProject {
  company: string | null;
  revenue: number | null;
  cost: number | null;
  createdAt: Date | string;
}

export type CompanyFinanceEntryType = "revenue" | "cost";

export interface CompanyFinanceEntryRecord {
  company: string;
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

function emptyQuarter(): QuarterFinance {
  return { revenue: 0, cost: 0, profit: 0, projectCount: 0 };
}

function emptyQuarters(): Record<1 | 2 | 3 | 4, QuarterFinance> {
  return {
    1: emptyQuarter(),
    2: emptyQuarter(),
    3: emptyQuarter(),
    4: emptyQuarter(),
  };
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

function getYearQuarter(value: Date | string) {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})/.exec(value);
    if (match) {
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) {
        return { year: Number(match[1]), quarter: Math.ceil(month / 3) as 1 | 2 | 3 | 4 };
      }
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), quarter: Math.ceil((date.getMonth() + 1) / 3) as 1 | 2 | 3 | 4 };
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

/**
 * 프로젝트에 저장된 매출·매입을 회사와 생성일 기준 분기로 집계한다.
 * 회사가 지정되지 않았거나 목록에 없는 프로젝트는 unassigned 로 분리한다.
 */
export function summarizeCompanyFinance(projects: CompanyFinanceProject[], year: number) {
  const { summaries, summaryByCompany, unassigned } = createSummaries();

  for (const project of projects) {
    const date = getYearQuarter(project.createdAt);
    if (!date || date.year !== year) continue;

    const summary = isCompanyName(project.company) ? summaryByCompany.get(project.company) : undefined;
    if (summary) {
      addToSummary(summary, date.quarter, project.revenue, project.cost);
    } else {
      unassigned.revenue += project.revenue ?? 0;
      unassigned.cost += project.cost ?? 0;
      unassigned.profit = unassigned.revenue - unassigned.cost;
      unassigned.projectCount += 1;
    }
  }

  return { summaries, unassigned };
}

/**
 * 프로젝트와 분리해 직접 등록한 회사 매출·매입만 집계한다.
 * 프로젝트의 revenue/cost 값은 이 함수에 전달하지 않으므로 회사 장부에 섞이지 않는다.
 */
export function summarizeCompanyFinanceEntries(entries: CompanyFinanceEntryRecord[], year: number) {
  const { summaries, summaryByCompany, unassigned } = createSummaries();

  for (const entry of entries) {
    const date = getYearQuarter(entry.date);
    if (!date || date.year !== year) continue;

    const revenue = entry.type === "revenue" ? entry.amount : null;
    const cost = entry.type === "cost" ? entry.amount : null;
    const summary = isCompanyName(entry.company) ? summaryByCompany.get(entry.company) : undefined;
    if (summary) {
      addToSummary(summary, date.quarter, revenue, cost);
    } else {
      unassigned.revenue += revenue ?? 0;
      unassigned.cost += cost ?? 0;
      unassigned.profit = unassigned.revenue - unassigned.cost;
      unassigned.projectCount += 1;
    }
  }

  return { summaries, unassigned };
}

export function normalizeCompany(value: unknown): CompanyName | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return isCompanyName(normalized) ? normalized : null;
}

export { QUARTERS };
