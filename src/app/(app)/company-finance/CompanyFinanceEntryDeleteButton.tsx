"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCompanyFinanceEntry } from "@/app/actions/companyFinance";

export function CompanyFinanceEntryDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`“${title}” 내역을 삭제할까요?`)) return;
    setLoading(true);
    try {
      await deleteCompanyFinanceEntry(id);
      toast.success("회사 매출·매입 내역을 삭제했습니다.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={loading}
      aria-label={`${title} 삭제`}
      title="내역 삭제"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Trash2 size={14} aria-hidden="true" />
    </button>
  );
}
