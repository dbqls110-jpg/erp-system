"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteLeave } from "@/app/actions/leave";
import { toast } from "sonner";

export function LeaveDeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("이 휴가 내역을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteLeave(id);
        toast.success("삭제됐습니다.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-smoke-gray hover:text-destructive transition-colors disabled:opacity-50 shrink-0"
      title="삭제"
    >
      <Trash2 size={14} />
    </button>
  );
}
