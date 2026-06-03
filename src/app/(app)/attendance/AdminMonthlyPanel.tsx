"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Users, Pencil } from "lucide-react";
import { adminUpdateAttendance } from "@/app/actions/attendance";
import { toast } from "sonner";

interface AttendanceRecord {
  id: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  workHours: number | null;
  user: { id: string; name: string | null; email: string };
}

interface UserSummary {
  user: { id: string; name: string | null; email: string };
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

function EditDialog({
  record,
  onClose,
  onSaved,
}: {
  record: AttendanceRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ci, setCi] = useState(toTime(record.clockIn));
  const [co, setCo] = useState(toTime(record.clockOut));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminUpdateAttendance(record.id, ci || null, co || null);
      toast.success("근태 기록이 수정됐습니다.");
      onSaved();
      onClose();
    } catch {
      toast.error("수정 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            근태 수정 — {record.date}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-smoke-gray">{record.user.name ?? record.user.email}</p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="space-y-1">
            <label className="text-xs text-smoke-gray">출근 시간</label>
            <Input type="time" value={ci} onChange={(e) => setCi(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-smoke-gray">퇴근 시간</label>
            <Input type="time" value={co} onChange={(e) => setCo(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>취소</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-dark-onyx text-white" style={{ borderRadius: "9px" }}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminMonthlyPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summaries, setSummaries] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
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
    <>
      {editRecord && (
        <EditDialog
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-deep-space-charcoal flex items-center gap-2" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              <Users size={16} className="text-deep-violet" />
              전체 직원 월별 근태
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={prevMonth} disabled={loading}><ChevronLeft size={14} /></Button>
              <span className="text-sm font-medium text-midnight-charcoal min-w-[80px] text-center">
                {year}년 {month}월{loading && " …"}
              </span>
              <Button variant="ghost" size="sm" onClick={nextMonth} disabled={loading}><ChevronRight size={14} /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {summaries.length === 0 && !loading ? (
            <p className="text-sm text-smoke-gray text-center py-4">해당 월 근태 기록이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {summaries.map((s) => (
                <div key={s.user.id} className="border border-ash-gray rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpanded(expanded === s.user.id ? null : s.user.id)}
                  >
                    <span className="text-sm font-medium text-midnight-charcoal">{s.user.name ?? s.user.email}</span>
                    <div className="flex items-center gap-3 text-xs text-smoke-gray">
                      <Badge variant="outline" className="text-xs">{s.workDays}일 출근</Badge>
                      <span className="font-medium text-midnight-charcoal">{s.totalHours.toFixed(1)}h</span>
                      <span className="text-smoke-gray">{expanded === s.user.id ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expanded === s.user.id && (
                    <div className="border-t border-ash-gray divide-y divide-ash-gray">
                      {s.records.map((r) => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2 text-xs text-smoke-gray bg-gray-50/50">
                          <span className="font-medium text-midnight-charcoal">{r.date}</span>
                          <div className="flex items-center gap-3">
                            <span>출근 {fmt(r.clockIn)}</span>
                            <span>퇴근 {fmt(r.clockOut)}</span>
                            {r.workHours != null && (
                              <Badge variant="outline" className="text-[10px] py-0">{r.workHours.toFixed(1)}h</Badge>
                            )}
                            <button
                              onClick={() => setEditRecord(r)}
                              className="text-smoke-gray hover:text-deep-violet transition-colors"
                              title="수정"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
