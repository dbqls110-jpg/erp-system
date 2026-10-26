import type { Prisma } from "@prisma/client";
import { COMPANY_NAMES, normalizeCompany, type CompanyName } from "@/lib/companyFinance";

export type ProjectSearchParams = Partial<Record<"status" | "year" | "month" | "company", string | string[]>>;
export type ProjectStatusFilter = "all" | "active" | "completed" | "on_hold";
type ProjectPeriod = { kind: "all" } | { kind: "year"; year: number } | { kind: "month"; year: number; month: number };
export type ProjectListFilters = {
  status: ProjectStatusFilter;
  company: CompanyName | "all" | "unassigned";
  period: ProjectPeriod;
};

function integerParam(value: string | string[] | undefined, min: number, max: number) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function parseProjectFilters(params: ProjectSearchParams, currentYear: number): ProjectListFilters {
  const year = integerParam(params.year, 2000, 2100);
  const month = integerParam(params.month, 1, 12);
  const status = params.status === "active" || params.status === "completed" || params.status === "on_hold" ? params.status : "all";
  return {
    status,
    company: params.company === "unassigned" ? "unassigned" : normalizeCompany(params.company) ?? "all",
    period: month !== null ? { kind: "month", year: year ?? currentYear, month }
      : year !== null ? { kind: "year", year } : { kind: "all" },
  };
}

export function projectFiltersHref(filters: ProjectListFilters) {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.company !== "all") params.set("company", filters.company);
  if (filters.period.kind !== "all") params.set("year", String(filters.period.year));
  if (filters.period.kind === "month") params.set("month", String(filters.period.month));
  return params.size ? `/projects?${params}` : "/projects";
}

export function projectFiltersWhere(filters: ProjectListFilters): Prisma.ProjectWhereInput {
  const conditions: Prisma.ProjectWhereInput[] = [];
  if (filters.status !== "all") conditions.push({ status: filters.status });
  if (filters.company === "unassigned") conditions.push({ OR: [{ company: null }, { company: { notIn: [...COMPANY_NAMES] } }] });
  else if (filters.company !== "all") conditions.push({ company: filters.company });
  if (filters.period.kind !== "all") {
    const { year } = filters.period;
    const month = filters.period.kind === "month" ? filters.period.month : 1;
    const endYear = filters.period.kind === "year" || month === 12 ? year + 1 : year;
    const endMonth = filters.period.kind === "year" || month === 12 ? 1 : month + 1;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
    conditions.push({ OR: [
      { deadline: { gte: start, lt: end } },
      { AND: [
        { OR: [{ deadline: null }, { deadline: "" }] },
        { createdAt: { gte: new Date(`${start}T00:00:00+09:00`), lt: new Date(`${end}T00:00:00+09:00`) } },
      ] },
    ] });
  }
  return { AND: conditions };
}
