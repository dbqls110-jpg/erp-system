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

export function LeaveApplyButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("annual");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      formData.set("type", type);
      await applyLeave(formData);
      toast.success("휴가 신청이 완료됐습니다.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "신청 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-dark-onyx text-white hover:bg-midnight-charcoal" style={{ borderRadius: "9px" }}>
        <Plus size={16} /> 휴가 신청
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>휴가 신청</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>휴가 유형</Label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">연차 (1일)</SelectItem>
                  <SelectItem value="half_am">반차 - 오전 (0.5일)</SelectItem>
                  <SelectItem value="half_pm">반차 - 오후 (0.5일)</SelectItem>
                  <SelectItem value="hourly">시간차</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>시작일</Label>
                <Input type="date" name="startDate" required />
              </div>
              <div className="space-y-1">
                <Label>종료일</Label>
                <Input type="date" name="endDate" required />
              </div>
            </div>
            {type === "hourly" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>시작 시간</Label>
                  <Input type="time" name="startTime" />
                </div>
                <div className="space-y-1">
                  <Label>종료 시간</Label>
                  <Input type="time" name="endTime" />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>사유 (선택)</Label>
              <Textarea name="reason" placeholder="휴가 사유를 입력하세요" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
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
