"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateProject } from "@/app/actions/project";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

interface Project {
  id: string;
  name: string;
  client: string | null;
  announceDate: string | null;
  deadline: string | null;
  assignee: string | null;
  memo: string | null;
  status: string;
}

export function ProjectEditButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(project.status);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("status", status);
      await updateProject(project.id, fd);
      toast.success("저장됐습니다.");
      setOpen(false);
    } catch {
      toast.error("저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1 shrink-0">
        <Pencil size={14} /> 수정
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>프로젝트 수정</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>프로젝트명 *</Label>
              <Input name="name" required defaultValue={project.name} />
            </div>
            <div className="space-y-1">
              <Label>클라이언트</Label>
              <Input name="client" defaultValue={project.client ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>발표일</Label>
                <Input type="date" name="announceDate" defaultValue={project.announceDate ?? ""} />
              </div>
              <div className="space-y-1">
                <Label>마감일</Label>
                <Input type="date" name="deadline" defaultValue={project.deadline ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>담당자</Label>
                <Input name="assignee" defaultValue={project.assignee ?? ""} />
              </div>
              <div className="space-y-1">
                <Label>상태</Label>
                <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">진행 중</SelectItem>
                    <SelectItem value="completed">완료</SelectItem>
                    <SelectItem value="on_hold">보류</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>메모</Label>
              <Textarea name="memo" rows={3} defaultValue={project.memo ?? ""} />
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
