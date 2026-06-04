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
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 group text-sm font-medium text-midnight-charcoal hover:text-deep-violet transition-colors"
      >
        {value || "이름 없음"}
        <Pencil size={12} className="opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setValue(initialName); setEditing(false); } }}
        className="h-7 text-sm w-28 px-2"
        autoFocus
        disabled={isPending}
      />
      <button onClick={handleSave} disabled={isPending} className="text-green-600 hover:text-green-700 transition-colors">
        <Check size={15} />
      </button>
      <button onClick={() => { setValue(initialName); setEditing(false); }} className="text-smoke-gray hover:text-destructive transition-colors">
        <X size={15} />
      </button>
    </div>
  );
}
