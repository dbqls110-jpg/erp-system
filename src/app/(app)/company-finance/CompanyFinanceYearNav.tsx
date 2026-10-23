import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { companyFinanceHref, type CompanyFinanceFilters } from "@/lib/companyFinanceFilters";

export function CompanyFinanceYearNav({ filters, currentYear }: { filters: CompanyFinanceFilters; currentYear: number }) {
  const { year } = filters;
  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-border bg-background p-1" aria-label="연도 선택">
      {year > 2000 && <Link
        href={companyFinanceHref({ ...filters, year: year - 1 })}
        prefetch={false}
        aria-label={`${year - 1}년 보기`}
        className="inline-flex size-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>}
      <span className="min-w-20 text-center text-sm font-semibold tabular-nums">{year}년</span>
      {year < 2100 && <Link
        href={companyFinanceHref({ ...filters, year: year + 1 })}
        prefetch={false}
        aria-label={`${year + 1}년 보기`}
        className="inline-flex size-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Link>}
      {year !== currentYear && (
        <Link href={companyFinanceHref({ ...filters, year: currentYear })} prefetch={false} className="ml-1 rounded-md px-2 py-1 text-[11.5px] text-primary hover:bg-primary/10">
          올해
        </Link>
      )}
    </div>
  );
}
