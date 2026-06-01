"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addChecklistItem, toggleChecklistItem, deleteChecklistItem } from "@/app/actions/project";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  content: string;
  isDone: boolean;
}

export function ChecklistPanel({ projectId, items }: { projectId: string; items: ChecklistItem[] }) {
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!newItem.trim()) return;
    setLoading(true);
    try {
      await addChecklistItem(projectId, newItem.trim());
      setNewItem("");
    } catch {
      toast.error("추가 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (itemId: string) => {
    try {
      await toggleChecklistItem(itemId, projectId);
    } catch {
      toast.error("업데이트 실패");
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteChecklistItem(itemId, projectId);
    } catch {
      toast.error("삭제 실패");
    }
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-smoke-gray">체크리스트 항목이 없습니다.</p>}
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 group">
          <button
            onClick={() => handleToggle(item.id)}
            className={cn(
              "w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors",
              item.isDone ? "bg-deep-violet border-deep-violet" : "border-ash-gray hover:border-deep-violet"
            )}
          >
            {item.isDone && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
          <span className={cn("flex-1 text-sm", item.isDone ? "line-through text-smoke-gray" : "text-midnight-charcoal")}>
            {item.content}
          </span>
          <button onClick={() => handleDelete(item.id)} className="opacity-0 group-hover:opacity-100 text-smoke-gray hover:text-destructive transition-opacity">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="flex gap-2 pt-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="새 항목 추가"
          className="text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={loading} size="sm" variant="outline" className="gap-1 shrink-0">
          <Plus size={14} /> 추가
        </Button>
      </div>
    </div>
  );
}
