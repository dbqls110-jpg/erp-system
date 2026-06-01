"use client";

import { deleteExpense } from "@/app/actions/finance";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function ExpenseDeleteButton({ id }: { id: string }) {
  const handleDelete = async () => {
    try {
      await deleteExpense(id);
      toast.success("삭제됐습니다.");
    } catch {
      toast.error("삭제 실패");
    }
  };

  return (
    <button onClick={handleDelete} className="text-smoke-gray hover:text-destructive transition-colors">
      <Trash2 size={14} />
    </button>
  );
}
