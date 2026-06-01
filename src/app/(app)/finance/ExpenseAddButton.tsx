"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addExpense } from "@/app/actions/finance";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { format } from "date-fns";

export function ExpenseAddButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("other");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("category", category);
      await addExpense(fd);
      toast.success("지출이 등록됐습니다.");
      setOpen(false);
    } catch {
      toast.error("등록 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-dark-onyx text-white hover:bg-midnight-charcoal" style={{ borderRadius: "9px" }}>
        <Plus size={16} /> 지출 입력
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>지출 입력</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>날짜 *</Label>
                <Input type="date" name="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} />
              </div>
              <div className="space-y-1">
                <Label>금액 *</Label>
                <Input type="number" name="amount" required placeholder="0" min="0" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>항목명 *</Label>
              <Input name="title" required placeholder="예: 사무용품 구매" />
            </div>
            <div className="space-y-1">
              <Label>카테고리</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rent">임차료</SelectItem>
                  <SelectItem value="salary">인건비</SelectItem>
                  <SelectItem value="telecom">통신비</SelectItem>
                  <SelectItem value="supplies">비품</SelectItem>
                  <SelectItem value="food">식대</SelectItem>
                  <SelectItem value="other">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>메모</Label>
              <Textarea name="memo" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={loading} className="bg-dark-onyx text-white" style={{ borderRadius: "9px" }}>
                {loading ? "등록 중..." : "등록"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
