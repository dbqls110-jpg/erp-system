"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
function toHref(
  { year, month }: { year: number; month: number },
  current: { year: number; month: number },
) {
  if (year === current.year && month === current.month) return "/finance";
  return `/finance?year=${year}&month=${month}`;
}

const navBtn = "flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function FinanceMonthNav({
  year,
  month,
  currentYear,
  currentMonth,
}: {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
}) {
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const current = { year: currentYear, month: currentMonth };
  const isCurrent = year === currentYear && month === currentMonth;

  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-border px-1">
      <Link href={toHref(prev, current)} className={navBtn} aria-label="이전 달"><ChevronLeft size={15} /></Link>
      <span className="min-w-[76px] py-1 text-center text-[13px] font-semibold text-foreground">
        {year}년 {month}월
      </span>
      {isCurrent ? (
        <span className={`${navBtn} opacity-30 pointer-events-none`} aria-hidden="true"><ChevronRight size={15} /></span>
      ) : (
        <Link href={toHref(next, current)} className={navBtn} aria-label="다음 달"><ChevronRight size={15} /></Link>
      )}
    </div>
  );
}
