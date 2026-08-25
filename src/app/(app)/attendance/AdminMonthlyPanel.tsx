"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Users, Pencil, Check, X } from "lucide-react";
import Link from "next/link";
import { adminUpdateAttendance } from "@/app/actions/attendance";
import { toneBadgeClass } from "@/lib/badge-tone";
import { toast } from "sonner";

interface AttendanceRecord {
  id: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  workHours: number | null;
  user: { id: string; name: string | null; email: string; isAgent: boolean };
}

interface UserSummary {
  user: { id: string; name: string | null; email: string; isAgent: boolean };
  records: AttendanceRecord[];
  totalHours: number;
  workDays: number;
}

function fmt(isoStr: string | null) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function toTime(isoStr: string | null) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function AttendanceRow({ r, onSaved }: { r: AttendanceRecord; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [ci, setCi] = useState(toTime(r.clockIn));
  const [co, setCo] = useState(toTime(r.clockOut));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminUpdateAttendance(r.id, ci || null, co || null);
      toast.success("수정됐습니다.");
      setEditing(false);
      onSaved();
    } catch {
      toast.error("수정 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCi(toTime(r.clockIn));
    setCo(toTime(r.clockOut));
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground bg-muted/50 border-b border-border last:border-0">
      <span className="font-medium text-foreground w-24 shrink-0">{r.date}</span>
      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-muted-foreground">출근</span>
          <Input type="time" value={ci} onChange={(e) => setCi(e.target.value)} className="h-6 text-xs w-28 px-1" />
          <span className="text-muted-foreground">퇴근</span>
          <Input type="time" value={co} onChange={(e) => setCo(e.target.value)} className="h-6 text-xs w-28 px-1" />
          <button onClick={handleSave} disabled={saving} className="text-primary hover:opacity-70">
            <Check className="size-3.5" />
          </button>
          <button onClick={handleCancel} className="text-muted-foreground hover:text-destructive">
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-4 flex-1 justify-end">
          <span>출근 {fmt(r.clockIn)}</span>
          <span>퇴근 {fmt(r.clockOut)}</span>
          {r.workHours != null && (
            <Badge variant="outline" className="text-[10px] py-0">{r.workHours.toFixed(1)}h</Badge>
          )}
          <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary transition-colors" title="수정">
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminMonthlyPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summaries, setSummaries] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/attendance/admin?year=${year}&month=${month}`);
        const records: AttendanceRecord[] = await res.json();
        if (cancelled) return;

        const map = new Map<string, UserSummary>();
        for (const r of records) {
          const uid = r.user.id;
          if (!map.has(uid)) {
            map.set(uid, { user: r.user, records: [], totalHours: 0, workDays: 0 });
          }
          const s = map.get(uid)!;
          s.records.push(r);
          s.totalHours += r.workHours ?? 0;
          if (r.workHours) s.workDays++;
        }
        setSummaries(Array.from(map.values()).sort((a, b) => (a.user.name ?? "").localeCompare(b.user.name ?? "")));
      } catch {
        // keep existing
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [year, month, refreshKey]);

  const prevMonth = () => {
    setExpanded(null);
    setYear(month === 1 ? year - 1 : year);
    setMonth(month === 1 ? 12 : month - 1);
  };
  const nextMonth = () => {
    setExpanded(null);
    setYear(month === 12 ? year + 1 : year);
    setMonth(month === 12 ? 1 : month + 1);
  };

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            <Users className="size-4 text-primary" />
            전체 직원 월별 근태
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-9 py-2" onClick={prevMonth} disabled={loading}><ChevronLeft className="size-3.5" /></Button>
            <span className="text-sm font-medium text-foreground min-w-[80px] text-center">
              {year}년 {month}월{loading && " …"}
            </span>
            <Button variant="ghost" size="sm" className="h-9 py-2" onClick={nextMonth} disabled={loading}><ChevronRight className="size-3.5" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {summaries.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">해당 월 근태 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {summaries.map((s) => (
              <div key={s.user.id} className="border border-border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors text-left"
                  onClick={() => setExpanded(expanded === s.user.id ? null : s.user.id)}
                >
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/attendance/${s.user.id}?year=${year}&month=${month}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
                    >
                      {s.user.name ?? s.user.email}
                    </Link>
                    {s.user.isAgent && (
                      <Badge variant="outline" className={`${toneBadgeClass("purple")} text-[10px] py-0 px-1.5`}>AI</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">{s.workDays}일 출근</Badge>
                    <span className="font-medium text-foreground">{s.totalHours.toFixed(1)}h</span>
                    <span>{expanded === s.user.id ? "▲" : "▼"}</span>
                  </div>
                </button>
                {expanded === s.user.id && (
                  <div className="border-t border-border">
                    {s.records.map((r) => (
                      <AttendanceRow key={r.id} r={r} onSaved={() => setRefreshKey((k) => k + 1)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}