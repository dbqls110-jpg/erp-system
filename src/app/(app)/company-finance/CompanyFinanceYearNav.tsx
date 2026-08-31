import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CompanyFinanceYearNav({ year, currentYear }: { year: number; currentYear: number }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1" aria-label="연도 선택">
      <Link
        href={`/company-finance?year=${year - 1}`}
        aria-label={`${year - 1}년 보기`}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>
      <span className="min-w-20 text-center text-sm font-semibold tabular-nums">{year}년</span>
      <Link
        href={`/company-finance?year=${year + 1}`}
        aria-label={`${year + 1}년 보기`}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
      {year !== currentYear && (
        <Link href="/company-finance" className="ml-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10">
          올해
        </Link>
      )}
    </div>
  );
}
