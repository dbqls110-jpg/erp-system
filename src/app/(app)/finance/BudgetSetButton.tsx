"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setBudget } from "@/app/actions/finance";
import { toast } from "sonner";
import { Settings } from "lucide-react";

export function BudgetSetButton({ year, month, currentAmount }: { year: number; month: number; currentAmount?: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setBudget(new FormData(e.currentTarget));
      toast.success("예산이 설정됐습니다.");
      setOpen(false);
    } catch {
      toast.error("설정 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2" style={{ borderRadius: "9px" }}>
        <Settings size={15} /> 예산 설정
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{year}년 {month}월 예산 설정</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <div className="space-y-1">
              <Label>예산 금액 (원)</Label>
              <Input type="number" name="amount" required defaultValue={currentAmount ?? ""} placeholder="예: 5000000" min="0" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={loading} className="bg-dark-onyx text-white" style={{ borderRadius: "9px" }}>
                {loading ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
