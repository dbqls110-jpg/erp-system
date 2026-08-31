"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyLeave } from "@/app/actions/leave";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const isSingleDay = (t: string) => t === "half_am" || t === "half_pm" || t === "hourly";

export function LeaveApplyButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<HTMLInputElement>(null);
  const endTimeRef = useRef<HTMLInputElement>(null);

  const handleTypeChange = (v: string | null) => {
    if (!v) return;
    setType(v);
    setValidationError(null);
    if (isSingleDay(v)) setEndDate(startDate);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);
    const fd = new FormData(e.currentTarget);
    const start = startDate.trim();
    const end = isSingleDay(type) ? start : endDate.trim();
    if (!start) {
      setValidationError("시작일을 입력해 주세요.");
      startDateRef.current?.focus();
      return;
    }
    if (!end) {
      setValidationError("종료일을 입력해 주세요.");
      endDateRef.current?.focus();
      return;
    }
    if (end < start) {
      setValidationError("종료일은 시작일 이후여야 합니다.");
      endDateRef.current?.focus();
      return;
    }
    if (type === "hourly") {
      const startTime = String(fd.get("startTime") ?? "");
      const endTime = String(fd.get("endTime") ?? "");
      if (!startTime || !endTime) {
        setValidationError("시간차의 시작·종료 시간을 입력해 주세요.");
        (startTime ? endTimeRef : startTimeRef).current?.focus();
        return;
      }
      if (endTime <= startTime) {
        setValidationError("종료 시간은 시작 시간 이후여야 합니다.");
        endTimeRef.current?.focus();
        return;
      }
    }

    setLoading(true);
    try {
      fd.set("type", type);
      fd.set("startDate", start);
      // 반차는 종료일 = 시작일로 고정
      if (isSingleDay(type)) {
        fd.set("endDate", start);
      }
      await applyLeave(fd);
      toast.success("휴가 신청이 완료됐습니다.");
      setOpen(false);
      setStartDate("");
      setEndDate("");
      setValidationError(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "신청 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setStartDate("");
      setEndDate("");
      setValidationError(null);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-dark-onyx text-white hover:bg-muted" style={{ borderRadius: "9px" }}>
        <Plus size={16} /> 휴가 신청
      </Button>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>휴가 신청</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {validationError && <p className="text-sm text-destructive" role="alert">{validationError}</p>}
            <div className="space-y-1">
              <Label htmlFor="leave-type">휴가 유형</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger id="leave-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">연차</SelectItem>
                  <SelectItem value="half_am">반차 - 오전 (0.5일)</SelectItem>
                  <SelectItem value="half_pm">반차 - 오후 (0.5일)</SelectItem>
                  <SelectItem value="hourly">시간차</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 반차: 날짜 하나만 */}
            {isSingleDay(type) ? (
              <div className="space-y-1">
                <Label htmlFor="leave-start-date">날짜</Label>
                <Input
                  id="leave-start-date"
                  ref={startDateRef}
                  type="date"
                  name="startDate"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setEndDate(e.target.value); setValidationError(null); }}
                  aria-invalid={validationError?.includes("시작일") || undefined}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="leave-start-date">시작일</Label>
                  <Input
                    id="leave-start-date"
                    ref={startDateRef}
                    type="date"
                    name="startDate"
                    value={startDate}
                    onChange={(e) => { const value = e.target.value; setStartDate(value); if (!endDate || endDate < value) setEndDate(value); setValidationError(null); }}
                    aria-invalid={validationError?.includes("시작일") || undefined}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="leave-end-date">종료일</Label>
                  <Input
                    id="leave-end-date"
                    ref={endDateRef}
                    type="date"
                    name="endDate"
                    min={startDate}
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setValidationError(null); }}
                    aria-invalid={validationError?.includes("종료일") || undefined}
                  />
                </div>
              </div>
            )}

            {type === "hourly" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="leave-start-time">시작 시간</Label>
                   <Input ref={startTimeRef} id="leave-start-time" type="time" name="startTime" defaultValue="10:00" min="06:00" max="23:00" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="leave-end-time">종료 시간</Label>
                   <Input ref={endTimeRef} id="leave-end-time" type="time" name="endTime" defaultValue="18:00" min="06:00" max="23:00" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>사유 (선택)</Label>
              <Textarea name="reason" placeholder="휴가 사유를 입력하세요" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>취소</Button>
              <Button type="submit" disabled={loading} className="bg-dark-onyx text-white hover:bg-muted" style={{ borderRadius: "9px" }}>
                {loading ? "신청 중..." : "신청"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
