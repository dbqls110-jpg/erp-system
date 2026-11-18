"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { setProjectCompletionAction } from "@/app/actions/projectTask";

export function ProjectCompletionButton({ projectId, name, status }: { projectId: string; name: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const completed = status === "completed";
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={`${name} ${completed ? "완료 취소" : "프로젝트 완료"}`}>
      {completed ? <Undo2 size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}{completed ? "완료 취소" : "프로젝트 완료"}
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{completed ? "진행 중으로 되돌릴까요?" : "전체 완료하셨습니까?"}</DialogTitle><DialogDescription className="break-words">{name}</DialogDescription></DialogHeader>
        <p className="text-sm leading-relaxed">{completed ? "프로젝트를 진행 중으로 되돌리고, 진행률은 기존 할 일의 완료 비율로 표시합니다." : "프로젝트 상태를 완료로 바꾸고 진행률을 100%로 표시합니다."}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">기존 할 일의 체크 상태와 견적서·파일·매출매입·지급 기록은 변경하지 않습니다.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>취소</Button><Button type="button" disabled={pending} onClick={() => startTransition(async () => {
          try {
            const result = await setProjectCompletionAction({ projectId, expectedStatus: status, completed: !completed });
            if (!result.ok) { toast.error(result.message); router.refresh(); return; }
            toast.success(completed ? "프로젝트를 진행 중으로 되돌렸습니다." : "프로젝트를 완료했습니다. 진행률 100%로 반영됩니다.");
            setOpen(false); router.refresh();
          } catch { toast.error("저장 결과를 확인하지 못했습니다. 새로고침 후 상태를 확인해 주세요."); }
        })}>{pending ? "저장 중…" : completed ? "네, 되돌리기" : "네, 완료"}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
