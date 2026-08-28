export const COMPANY_NAMES = ["인포피아", "노바웨이", "클로원"] as const;

export type CompanyName = (typeof COMPANY_NAMES)[number];

export interface CompanyFinanceProject {
  company: string | null;
  revenue: number | null;
  cost: number | null;
  createdAt: Date | string;
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

/**
 * 프로젝트에 저장된 매출·매입을 회사와 생성일 기준 분기로 집계한다.
 * 회사가 지정되지 않았거나 목록에 없는 프로젝트는 unassigned 로 분리한다.
 */
export function summarizeCompanyFinance(projects: CompanyFinanceProject[], year: number) {
  const summaries = COMPANY_NAMES.map((company) => ({
    company,
    quarters: emptyQuarters(),
    revenue: 0,
    cost: 0,
    profit: 0,
    projectCount: 0,
  } satisfies CompanyFinanceSummary));
  const summaryByCompany = new Map(summaries.map((summary) => [summary.company, summary]));
  const unassigned: UnassignedFinanceSummary = { revenue: 0, cost: 0, profit: 0, projectCount: 0 };

  for (const project of projects) {
    const date = project.createdAt instanceof Date ? project.createdAt : new Date(project.createdAt);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) continue;

    const quarter = Math.ceil((date.getMonth() + 1) / 3) as 1 | 2 | 3 | 4;
    const summary = isCompanyName(project.company) ? summaryByCompany.get(project.company) : undefined;
    if (summary) {
      addAmounts(summary.quarters[quarter], project.revenue, project.cost);
      summary.revenue += project.revenue ?? 0;
      summary.cost += project.cost ?? 0;
      summary.profit = summary.revenue - summary.cost;
      summary.projectCount += 1;
    } else {
      unassigned.revenue += project.revenue ?? 0;
      unassigned.cost += project.cost ?? 0;
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
