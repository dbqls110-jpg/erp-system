"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBusinessCard } from "@/app/actions/businessCard";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export function CardCreateButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createBusinessCard(new FormData(e.currentTarget));
      toast.success("명함이 등록됐습니다.");
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
        <Plus size={16} /> 명함 등록
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>명함 등록</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>이름 *</Label>
                <Input name="name" required placeholder="홍길동" />
              </div>
              <div className="space-y-1">
                <Label>직함</Label>
                <Input name="jobTitle" placeholder="대표이사" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>회사명</Label>
              <Input name="company" placeholder="(주)회사명" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>전화번호</Label>
                <Input name="phone" placeholder="010-0000-0000" />
              </div>
              <div className="space-y-1">
                <Label>이메일</Label>
                <Input name="email" type="email" placeholder="email@example.com" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>주소</Label>
              <Input name="address" placeholder="서울시 강남구..." />
            </div>
            <div className="flex gap-2 justify-end pt-2">
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
