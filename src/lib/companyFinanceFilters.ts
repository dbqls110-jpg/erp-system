import { COMPANY_NAMES, normalizeCompany, type CompanyName } from "@/lib/companyFinance";

type SearchValue = string | string[] | undefined;
export type CompanyFinanceSearchParams = { year?: SearchValue; month?: SearchValue; company?: SearchValue };
export type CompanyFinanceFilters = {
  year: number;
  month: number | null;
  company: CompanyName | "all" | "unassigned";
};

function integerParam(value: SearchValue, min: number, max: number) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export function parseCompanyFinanceFilters(params: CompanyFinanceSearchParams, currentYear: number): CompanyFinanceFilters {
  return {
    year: integerParam(params.year, 2000, 2100) ?? currentYear,
    month: integerParam(params.month, 1, 12),
    company: params.company === "unassigned" ? "unassigned" : normalizeCompany(params.company) ?? "all",
  };
}

export function companyFinanceHref(filters: CompanyFinanceFilters) {
  const params = new URLSearchParams({ year: String(filters.year) });
  if (filters.company !== "all") params.set("company", filters.company);
  if (filters.month !== null) params.set("month", String(filters.month));
  return `/company-finance?${params}`;
}

/** Both ledgers use the same half-open KST period; no UTC month-boundary drift. */
export function companyFinanceWhere(filters: CompanyFinanceFilters) {
  const month = filters.month ?? 1;
  const start = `${filters.year}-${String(month).padStart(2, "0")}-01`;
  const endYear = filters.month === null || month === 12 ? filters.year + 1 : filters.year;
  const endMonth = filters.month === null || month === 12 ? 1 : month + 1;
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
  const company = filters.company === "all" ? undefined
    : filters.company === "unassigned" ? { notIn: [...COMPANY_NAMES] } : filters.company;
  return {
    entries: { date: { gte: start, lt: end }, ...(company === undefined ? {} : { company }) },
    projectAmounts: {
      createdAt: { gte: new Date(`${start}T00:00:00+09:00`), lt: new Date(`${end}T00:00:00+09:00`) },
      ...(filters.company === "all" ? {} : {
        project: filters.company === "unassigned"
          ? { OR: [{ company: null }, { company: { notIn: [...COMPANY_NAMES] } }] }
          : { company: filters.company },
      }),
    },
  };
}

export function companyFinanceFilterLabel(filters: CompanyFinanceFilters) {
  const company = filters.company === "all" ? "전체 회사" : filters.company === "unassigned" ? "미배정" : filters.company;
  return `${company} · ${filters.year}년 ${filters.month === null ? "전체 월" : `${filters.month}월`}`;
}
