"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createCalendarEvent, deleteCalendarEvent } from "@/app/actions/calendar";
import { toast } from "sonner";

interface CalEvent {
  date: string;
  title: string;
  type: "announce" | "deadline" | "leave" | "custom";
  id: string;
  endDate?: string;
  color?: string;
}

const COLOR_OPTIONS = [
  { value: "gray",   label: "회색",   class: "bg-gray-400" },
  { value: "blue",   label: "파랑",   class: "bg-blue-500" },
  { value: "green",  label: "초록",   class: "bg-green-500" },
  { value: "red",    label: "빨강",   class: "bg-red-500" },
  { value: "yellow", label: "노랑",   class: "bg-yellow-400" },
  { value: "purple", label: "보라",   class: "bg-purple-500" },
];

const TYPE_COLORS: Record<string, string> = {
  announce: "bg-electric-blue/10 text-electric-blue",
  deadline: "bg-warm-fade/10 text-warm-fade",
  leave: "bg-deep-violet/10 text-deep-violet",
};

const CUSTOM_COLORS: Record<string, string> = {
  gray:   "bg-gray-100 text-gray-700",
  blue:   "bg-blue-50 text-blue-700",
  green:  "bg-green-50 text-green-700",
  red:    "bg-red-50 text-red-700",
  yellow: "bg-yellow-50 text-yellow-700",
  purple: "bg-purple-50 text-purple-700",
};

function eventTitle(e: CalEvent) {
  return e.type === "custom" && e.color === "red" ? `⭐ ${e.title}` : e.title;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create"; date: string }
  | { mode: "detail"; date: string; events: CalEvent[] };

export function CalendarView({ initialEvents, currentYear, currentMonth }: {
  initialEvents: CalEvent[];
  currentYear: number;
  currentMonth: number;
}) {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [events, setEvents] = useState<CalEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });

  // create form state
  const [title, setTitle] = useState("");
  const [endDate, setEndDate] = useState("");
  const [color, setColor] = useState("blue");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?year=${y}&month=${m}`);
      const data = await res.json();
      setEvents(data);
    } catch {
      // keep existing events
    } finally {
      setLoading(false);
    }
  }, []);

  const prevMonth = () => {
    const newYear = month === 1 ? year - 1 : year;
    const newMonth = month === 1 ? 12 : month - 1;
    setYear(newYear); setMonth(newMonth);
    fetchEvents(newYear, newMonth);
  };

  const nextMonth = () => {
    const newYear = month === 12 ? year + 1 : year;
    const newMonth = month === 12 ? 1 : month + 1;
    setYear(newYear); setMonth(newMonth);
    fetchEvents(newYear, newMonth);
  };

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => {
      if (e.endDate && e.endDate > e.date) return dateStr >= e.date && dateStr <= e.endDate;
      return e.date === dateStr;
    });
  };

  function openDay(day: number) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = getEventsForDay(day);
    if (dayEvents.length > 0) {
      setModal({ mode: "detail", date: dateStr, events: dayEvents });
    } else {
      openCreate(dateStr);
    }
  }

  function openCreate(date: string) {
    setTitle(""); setEndDate(""); setColor("blue");
    setModal({ mode: "create", date });
  }

  async function handleCreate() {
    if (!title.trim()) return;
    if (modal.mode !== "create") return;
    setSaving(true);
    try {
      await createCalendarEvent({ title: title.trim(), date: modal.date, endDate: endDate || undefined, color });
      toast.success("일정이 추가됐습니다.");
      await fetchEvents(year, month);
      setModal({ mode: "closed" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    setDeletingId(id);
    try {
      await deleteCalendarEvent(id);
      toast.success(`"${title}" 삭제됐습니다.`);
      await fetchEvents(year, month);
      setModal({ mode: "closed" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <>
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={prevMonth} disabled={loading}><ChevronLeft size={16} /></Button>
            <h2 className="text-lg font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              {year}년 {month}월 {loading && <span className="text-xs text-smoke-gray font-normal">로딩 중...</span>}
            </h2>
            <Button variant="ghost" size="sm" onClick={nextMonth} disabled={loading}><ChevronRight size={16} /></Button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div key={d} className={cn("text-center text-xs font-medium py-1", i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-smoke-gray")}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-ash-gray rounded-lg overflow-hidden">
            {blanks.map((i) => <div key={`b-${i}`} className="bg-canvas-white min-h-[80px]" />)}
            {days.map((day) => {
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = getEventsForDay(day);
              const isToday = dateStr === today;
              const dow = (firstDay + day - 1) % 7;

              return (
                <div
                  key={day}
                  className="bg-canvas-white min-h-[80px] p-1 cursor-pointer hover:bg-hint-of-sky/40 transition-colors group"
                  onClick={() => openDay(day)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday ? "bg-deep-violet text-white" : dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-midnight-charcoal"
                    )}>
                      {day}
                    </span>
                    <Plus size={11} className="text-smoke-gray opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((e, i) => {
                      const cls = e.type === "custom"
                        ? CUSTOM_COLORS[e.color ?? "gray"]
                        : TYPE_COLORS[e.type];
                      if (e.type === "leave" || e.type === "announce" || e.type === "deadline") {
                        return (
                          <Link
                            key={i}
                            href={e.type === "leave" ? "/leave" : `/projects/${e.id}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className={cn("block text-[10px] rounded px-1 truncate hover:opacity-75 transition-opacity", cls)}
                            title={e.title}
                          >
                            {e.title}
                          </Link>
                        );
                      }
                      return (
                        <div key={i} className={cn("block text-[10px] rounded px-1 truncate", cls)} title={eventTitle(e)}>
                          {eventTitle(e)}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && <div className="text-[10px] text-smoke-gray">+{dayEvents.length - 2}개</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-4 mt-4 text-xs text-smoke-gray">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-electric-blue inline-block" />발표일</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warm-fade inline-block" />마감일</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-deep-violet inline-block" />휴가</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />직접 등록</span>
            <span className="text-smoke-gray/70">날짜 클릭 시 일정 추가</span>
          </div>
        </CardContent>
      </Card>

      {/* 일정 상세 모달 */}
      <Dialog open={modal.mode === "detail"} onOpenChange={(o) => { if (!o) setModal({ mode: "closed" }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {modal.mode === "detail" && formatDate(modal.date)} 일정
            </DialogTitle>
          </DialogHeader>
          {modal.mode === "detail" && (
            <div className="space-y-2">
              {modal.events.map((e, i) => {
                const cls = e.type === "custom" ? CUSTOM_COLORS[e.color ?? "gray"] : TYPE_COLORS[e.type];
                return (
                  <div key={i} className={cn("flex items-center justify-between rounded-lg px-3 py-2", cls)}>
                    <span className="text-sm font-medium truncate flex-1">{eventTitle(e)}</span>
                    {e.type === "custom" && (
                      <button
                        onClick={() => handleDelete(e.id, e.title)}
                        disabled={deletingId === e.id}
                        className="ml-2 opacity-60 hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1 mt-2"
                onClick={() => openCreate(modal.date)}
              >
                <Plus size={13} /> 일정 추가
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 일정 생성 모달 */}
      <Dialog open={modal.mode === "create"} onOpenChange={(o) => { if (!o) setModal({ mode: "closed" }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {modal.mode === "create" && formatDate(modal.date)} 일정 추가
            </DialogTitle>
          </DialogHeader>
          {modal.mode === "create" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>제목</Label>
                <Input
                  placeholder="일정 제목"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>종료일 <span className="text-smoke-gray text-xs">(선택)</span></Label>
                <Input
                  type="date"
                  value={endDate}
                  min={modal.date}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>색상</Label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setColor(c.value)}
                      title={c.label}
                      className={cn(
                        "w-6 h-6 rounded-full transition-all",
                        c.class,
                        color === c.value ? "ring-2 ring-offset-2 ring-midnight-charcoal scale-110" : "opacity-60 hover:opacity-100"
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" size="sm" onClick={() => setModal({ mode: "closed" })}>취소</Button>
                <Button size="sm" onClick={handleCreate} disabled={!title.trim() || saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
