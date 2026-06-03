"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelLeave } from "@/app/actions/leave";
import { toast } from "sonner";
import { X } from "lucide-react";

export function LeaveCancelButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleCancel = () => {
    startTransition(async () => {
      try {
        await cancelLeave(id);
        toast.success("휴가 신청이 취소됐습니다.");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "취소 실패");
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-smoke-gray hover:text-destructive transition-colors"
        title="취소"
      >
        <X size={14} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              휴가 신청 취소
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-smoke-gray">
            신청한 휴가를 취소하시겠습니까?<br />
            취소 후에는 다시 신청해야 합니다.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              닫기
            </Button>
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={handleCancel}
              disabled={pending}
            >
              {pending ? "취소 중…" : "신청 취소"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
