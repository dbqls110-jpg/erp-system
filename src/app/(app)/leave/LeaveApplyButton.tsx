"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);

  const handleTypeChange = (v: string | null) => {
    if (!v) return;
    setType(v);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("type", type);
      // 반차는 종료일 = 시작일로 고정
      if (isSingleDay(type)) {
        fd.set("endDate", fd.get("startDate") as string);
      }
      await applyLeave(fd);
      toast.success("휴가 신청이 완료됐습니다.");
      setOpen(false);
      setStartDate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "신청 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) setStartDate("");
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-dark-onyx text-white hover:bg-midnight-charcoal" style={{ borderRadius: "9px" }}>
        <Plus size={16} /> 휴가 신청
      </Button>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>휴가 신청</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>휴가 유형</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>날짜</Label>
                <Input
                  type="date"
                  name="startDate"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>시작일</Label>
                  <Input
                    type="date"
                    name="startDate"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>종료일</Label>
                  <Input
                    type="date"
                    name="endDate"
                    required
                    min={startDate}
                    defaultValue={startDate}
                  />
                </div>
              </div>
            )}

            {type === "hourly" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>시작 시간</Label>
                  <Input type="time" name="startTime" required defaultValue="10:00" min="06:00" max="23:00" />
                </div>
                <div className="space-y-1">
                  <Label>종료 시간</Label>
                  <Input type="time" name="endTime" required defaultValue="18:00" min="06:00" max="23:00" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>사유 (선택)</Label>
              <Textarea name="reason" placeholder="휴가 사유를 입력하세요" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>취소</Button>
              <Button type="submit" disabled={loading} className="bg-dark-onyx text-white hover:bg-midnight-charcoal" style={{ borderRadius: "9px" }}>
                {loading ? "신청 중..." : "신청"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
