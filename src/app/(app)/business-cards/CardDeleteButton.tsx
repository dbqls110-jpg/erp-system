"use client";

import { deleteBusinessCard } from "@/app/actions/businessCard";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function CardDeleteButton({ id }: { id: string }) {
  const handleDelete = async () => {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await deleteBusinessCard(id);
      toast.success("삭제됐습니다.");
    } catch {
      toast.error("삭제 실패");
    }
  };

  return (
    <button onClick={handleDelete} className="text-smoke-gray hover:text-destructive transition-colors ml-2 shrink-0">
      <Trash2 size={14} />
    </button>
  );
}
