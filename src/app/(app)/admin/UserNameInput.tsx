"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { updateUserName } from "@/app/actions/admin";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";

interface Props {
  userId: string;
  name: string;
}

export function UserNameInput({ userId, name: initialName }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!value.trim() || value.trim() === initialName) { setEditing(false); return; }
    startTransition(async () => {
      try {
        await updateUserName(userId, value.trim());
        toast.success("이름이 수정됐습니다.");
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="표시 이름 수정"
        aria-label={`${value || "이름 없음"} 표시 이름 수정`}
        className="group flex items-center gap-1.5 rounded-md text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {value || "이름 없음"}
        <Pencil size={12} aria-hidden="true" className="text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setValue(initialName); setEditing(false); } }}
        className="w-28"
        aria-label="표시 이름"
        autoFocus
        disabled={isPending}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        title="표시 이름 저장"
        aria-label="표시 이름 저장"
        className="text-green-600 transition-colors hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <Check size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => { setValue(initialName); setEditing(false); }}
        title="수정 취소"
        aria-label="표시 이름 수정 취소"
        className="text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
