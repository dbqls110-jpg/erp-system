"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { deleteProject } from "@/app/actions/project";
import { toast } from "sonner";

export function ProjectDeleteButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteProject(id);
        toast.success("프로젝트가 삭제됐습니다.");
        setOpen(false);
      } catch {
        toast.error("삭제 실패");
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-smoke-gray hover:text-red-500 hover:bg-red-50 shrink-0"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      >
        <Trash2 size={13} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              프로젝트 삭제
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-smoke-gray">
            <span className="font-semibold text-midnight-charcoal">&ldquo;{name}&rdquo;</span> 프로젝트를 삭제하시겠습니까?<br />
            관련 체크리스트도 함께 삭제되며 복구할 수 없습니다.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "삭제 중…" : "삭제"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
