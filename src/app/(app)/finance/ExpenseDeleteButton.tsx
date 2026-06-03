"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteExpense } from "@/app/actions/finance";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function ExpenseDeleteButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteExpense(id);
        toast.success("삭제됐습니다.");
        setOpen(false);
      } catch {
        toast.error("삭제 실패");
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-smoke-gray hover:text-destructive transition-colors"
      >
        <Trash2 size={14} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              지출 삭제
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-smoke-gray">
            <span className="font-semibold text-midnight-charcoal">&ldquo;{title}&rdquo;</span> 항목을 삭제하시겠습니까?
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
