import Form from "next/form";
import Link from "next/link";
import { COMPANY_NAMES } from "@/lib/companyFinance";
import type { ProjectListFilters } from "@/lib/projectFilters";

const selectClass = "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function ProjectSearchFilters({ filters, showCompany = true }: { filters: ProjectListFilters; showCompany?: boolean }) {
  const year = filters.period.kind === "all" ? "" : filters.period.year;
  const month = filters.period.kind === "month" ? filters.period.month : "all";
  return <Form action="/projects" prefetch={false} scroll={false} aria-label="프로젝트 조회 필터" className="space-y-3 rounded-xl border border-border bg-background p-4">
    <input type="hidden" name="status" value={filters.status} />
    <div className="flex flex-wrap items-end gap-3">
      {showCompany && <label className="flex flex-col gap-1.5 text-xs font-medium" htmlFor="project-filter-company">
        회사
        <select key={filters.company} id="project-filter-company" name="company" defaultValue={filters.company} className={selectClass}>
          <option value="all">전체 회사</option>
          {COMPANY_NAMES.map(company => <option key={company} value={company}>{company}</option>)}
          <option value="unassigned">미배정</option>
        </select>
      </label>}
      <label className="flex flex-col gap-1.5 text-xs font-medium" htmlFor="project-filter-year">
        연도
        <input key={year} id="project-filter-year" name="year" type="number" min={2000} max={2100} step={1} defaultValue={year} placeholder="전체 연도" className={`${selectClass} w-32`} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium" htmlFor="project-filter-month">
        월
        <select key={month} id="project-filter-month" name="month" defaultValue={month} className={selectClass}>
          <option value="all">전체 월</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
        </select>
      </label>
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">조회</button>
      <Link href="/projects" prefetch={false} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted">초기화</Link>
    </div>
    <p className="text-xs text-muted-foreground">마감일 기준 · 마감일이 없으면 등록일 기준 · 연도를 비우고 월만 선택하면 올해로 조회합니다.</p>
  </Form>;
}
