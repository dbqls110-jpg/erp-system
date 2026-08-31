"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { adminUpdateAttendance, adminDeleteAttendance } from "@/app/actions/attendance";
import { toast } from "sonner";

interface Props {
  id: string;
  date: string;
  clockInIso: string | null;
  clockOutIso: string | null;
}

function toTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AttendanceAdminRow({ id, date, clockInIso, clockOutIso }: Props) {
  const [editing, setEditing] = useState(false);
  const [ci, setCi] = useState(toTime(clockInIso));
  const [co, setCo] = useState(toTime(clockOutIso));
  const [savePending, startSave] = useTransition();
  const [delPending, startDel] = useTransition();

  const handleSave = () => {
    startSave(async () => {
      try {
        await adminUpdateAttendance(id, ci || null, co || null);
        toast.success("수정됐습니다.");
        setEditing(false);
      } catch {
        toast.error("수정 실패");
      }
    });
  };

  const handleCancel = () => {
    setCi(toTime(clockInIso));
    setCo(toTime(clockOutIso));
    setEditing(false);
  };

  const handleDelete = () => {
    if (!confirm(`${date} 근태 기록을 삭제하시겠습니까?`)) return;
    startDel(async () => {
      try {
        await adminDeleteAttendance(id);
        toast.success("삭제됐습니다.");
      } catch {
        toast.error("삭제 실패");
      }
    });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">출근</span>
        <Input type="time" value={ci} onChange={(e) => setCi(e.target.value)} className="h-6 text-xs w-28 px-1" />
        <span className="text-muted-foreground">퇴근</span>
        <Input type="time" value={co} onChange={(e) => setCo(e.target.value)} className="h-6 text-xs w-28 px-1" />
        <button type="button" onClick={handleSave} disabled={savePending} className="text-primary hover:opacity-70" title="저장" aria-label="근태 수정 저장">
          <Check size={14} />
        </button>
        <button type="button" onClick={handleCancel} className="text-muted-foreground hover:text-destructive" title="취소" aria-label="근태 수정 취소">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary transition-colors" title="수정" aria-label={`${date} 근태 수정`}>
        <Pencil size={13} />
      </button>
      <button type="button" onClick={handleDelete} disabled={delPending} className="text-muted-foreground hover:text-destructive transition-colors" title="삭제" aria-label={`${date} 근태 삭제`}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}
