"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
function toHref({ year, month }: { year: number; month: number }) {
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() + 1) return "/finance";
  return `/finance?year=${year}&month=${month}`;
}

const navBtn = "h-8 w-8 flex items-center justify-center rounded-lg text-smoke-gray hover:text-midnight-charcoal hover:bg-hint-of-sky transition-colors";

export function FinanceMonthNav({ year, month }: { year: number; month: number }) {
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="flex items-center gap-1 border border-ash-gray rounded-lg px-1">
      <Link href={toHref(prev)} className={navBtn}><ChevronLeft size={15} /></Link>
      <span className="text-sm font-medium text-midnight-charcoal min-w-[76px] text-center py-1">
        {year}년 {month}월
      </span>
      {isCurrent ? (
        <span className={`${navBtn} opacity-30 pointer-events-none`}><ChevronRight size={15} /></span>
      ) : (
        <Link href={toHref(next)} className={navBtn}><ChevronRight size={15} /></Link>
      )}
    </div>
  );
}
