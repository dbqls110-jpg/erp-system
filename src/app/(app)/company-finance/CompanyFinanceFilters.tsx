import Form from "next/form";
import Link from "next/link";
import { COMPANY_NAMES } from "@/lib/companyFinance";
import { type CompanyFinanceFilters as Filters } from "@/lib/companyFinanceFilters";

const selectClass = "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export function CompanyFinanceFilters({ filters, currentYear }: { filters: Filters; currentYear: number }) {
  return (
    <Form action="/company-finance" prefetch={false} scroll={false} aria-label="회사 매출·매입 필터" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-4">
      <label className="flex flex-col gap-1.5 text-xs font-medium" htmlFor="finance-filter-company">
        회사
        <select key={filters.company} id="finance-filter-company" name="company" defaultValue={filters.company} className={selectClass}>
          <option value="all">전체 회사</option>
          {COMPANY_NAMES.map((company) => <option key={company} value={company}>{company}</option>)}
          <option value="unassigned">미배정</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium" htmlFor="finance-filter-year">
        연도
        <input key={filters.year} id="finance-filter-year" name="year" type="number" min={2000} max={2100} step={1} required defaultValue={filters.year} className={`${selectClass} w-28`} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium" htmlFor="finance-filter-month">
        월
        <select key={filters.month ?? "all"} id="finance-filter-month" name="month" defaultValue={filters.month ?? "all"} className={selectClass}>
          <option value="all">전체 월</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
        </select>
      </label>
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">조회</button>
      <Link href={`/company-finance?year=${currentYear}`} prefetch={false} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted">초기화</Link>
    </Form>
  );
}
