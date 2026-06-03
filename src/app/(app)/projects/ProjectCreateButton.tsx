"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/app/actions/project";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export function ProjectCreateButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createProject(new FormData(e.currentTarget));
      toast.success("프로젝트가 생성됐습니다.");
      setOpen(false);
    } catch {
      toast.error("생성 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 bg-dark-onyx text-white hover:bg-midnight-charcoal" style={{ borderRadius: "9px" }}>
        <Plus size={16} /> 새 프로젝트
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>새 프로젝트</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>프로젝트명 *</Label>
              <Input name="name" required placeholder="예: 마늘축제" />
            </div>
            <div className="space-y-1">
              <Label>클라이언트</Label>
              <Input name="client" placeholder="클라이언트명" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>발표일</Label>
                <Input type="date" name="announceDate" />
              </div>
              <div className="space-y-1">
                <Label>마감일</Label>
                <Input type="date" name="deadline" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>담당자</Label>
              <Input name="assignee" placeholder="담당자 이름" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>매출 (원)</Label>
                <Input type="number" name="revenue" placeholder="0" min="0" step="10000" />
              </div>
              <div className="space-y-1">
                <Label>매입 (원)</Label>
                <Input type="number" name="cost" placeholder="0" min="0" step="10000" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>메모</Label>
              <Textarea name="memo" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" disabled={loading} className="bg-dark-onyx text-white" style={{ borderRadius: "9px" }}>
                {loading ? "생성 중..." : "생성"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
