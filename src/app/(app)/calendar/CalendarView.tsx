"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalEvent {
  date: string;
  title: string;
  type: "announce" | "deadline" | "leave";
  id: string;
  endDate?: string;
}

const typeColors = {
  announce: "bg-electric-blue/10 text-electric-blue",
  deadline: "bg-warm-fade/10 text-warm-fade",
  leave: "bg-deep-violet/10 text-deep-violet",
};

export function CalendarView({ events, currentYear, currentMonth }: {
  events: CalEvent[];
  currentYear: number;
  currentMonth: number;
}) {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => {
      if (e.endDate && e.endDate > e.date) {
        return dateStr >= e.date && dateStr <= e.endDate;
      }
      return e.date === dateStr;
    });
  };

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  return (
    <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
      <CardContent className="p-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft size={16} /></Button>
          <h2 className="text-lg font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            {year}년 {month}월
          </h2>
          <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight size={16} /></Button>
        </div>

        {/* 요일 */}
        <div className="grid grid-cols-7 mb-2">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div key={d} className={cn("text-center text-xs font-medium py-1", i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-smoke-gray")}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-px bg-ash-gray rounded-lg overflow-hidden">
          {blanks.map((i) => <div key={`b-${i}`} className="bg-canvas-white min-h-[80px]" />)}
          {days.map((day) => {
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayEvents = getEventsForDay(day);
            const isToday = dateStr === today;
            const dow = (firstDay + day - 1) % 7;

            return (
              <div key={day} className="bg-canvas-white min-h-[80px] p-1">
                <span className={cn(
                  "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-medium mb-1",
                  isToday ? "bg-deep-violet text-white" : dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-midnight-charcoal"
                )}>
                  {day}
                </span>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map((e, i) => (
                    <div key={i} className={cn("text-[10px] rounded px-1 truncate", typeColors[e.type])}>
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && <div className="text-[10px] text-smoke-gray">+{dayEvents.length - 2}개</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="flex gap-4 mt-4 text-xs text-smoke-gray">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-electric-blue inline-block" />발표일</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warm-fade inline-block" />마감일</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-deep-violet inline-block" />휴가</span>
        </div>
      </CardContent>
    </Card>
  );
}
