"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addChecklistItem, updateChecklistItem, toggleChecklistItem, deleteChecklistItem } from "@/app/actions/project";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  content: string;
  isDone: boolean;
  completedAt: Date | string | null;
}

function formatCompletedDate(value: Date | string) {
  const iso = typeof value === "string" ? value : value.toISOString();
  const [month, day] = iso.slice(5, 10).split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function ChecklistPanel({ projectId, items }: { projectId: string; items: ChecklistItem[] }) {
  const router = useRouter();
  const [checklistItems, setChecklistItems] = useState(items);
  const [newItem, setNewItem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const content = newItem.trim();
    if (!content || loading) return;
    setLoading(true);
    setError(null);
    try {
      const item = await addChecklistItem(projectId, content);
      setChecklistItems((current) => [...current, item]);
      setNewItem("");
      router.refresh();
      toast.success("체크리스트 항목을 추가했습니다.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "항목 추가에 실패했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (item: ChecklistItem) => {
    if (pendingId) return;
    setError(null);
    setEditingId(item.id);
    setEditingContent(item.content);
  };

  const handleCancelEdit = () => {
    if (pendingId) return;
    setEditingId(null);
    setEditingContent("");
    setError(null);
  };

  const handleSaveEdit = async (itemId: string) => {
    if (pendingId) return;
    const content = editingContent.trim();
    if (!content) {
      const message = "체크리스트 항목 내용을 입력해 주세요.";
      setError(message);
      toast.error(message);
      return;
    }

    const previous = checklistItems;
    const currentItem = checklistItems.find((item) => item.id === itemId);
    if (!currentItem) return;

    setPendingId(itemId);
    setError(null);
    setChecklistItems((current) => current.map((item) => (
      item.id === itemId ? { ...item, content } : item
    )));

    try {
      const updated = await updateChecklistItem(itemId, projectId, content);
      setChecklistItems((current) => current.map((item) => item.id === itemId ? updated : item));
      setEditingId(null);
      setEditingContent("");
      router.refresh();
      toast.success("체크리스트 항목을 수정했습니다.");
    } catch (err) {
      setChecklistItems(previous);
      const message = err instanceof Error ? err.message : "항목 수정에 실패했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingId(null);
    }
  };

  const handleToggle = async (itemId: string) => {
    if (pendingId) return;
    const currentItem = checklistItems.find((item) => item.id === itemId);
    if (!currentItem) return;

    const previous = checklistItems;
    const nextDone = !currentItem.isDone;
    setPendingId(itemId);
    setError(null);
    setChecklistItems((current) => current.map((item) => (
      item.id === itemId
        ? { ...item, isDone: nextDone, completedAt: nextDone ? new Date().toISOString() : null }
        : item
    )));

    try {
      const updated = await toggleChecklistItem(itemId, projectId);
      if (!updated) {
        setChecklistItems((current) => current.filter((item) => item.id !== itemId));
      } else {
        setChecklistItems((current) => current.map((item) => item.id === itemId ? updated : item));
      }
      router.refresh();
    } catch (err) {
      setChecklistItems(previous);
      const message = err instanceof Error ? err.message : "항목 상태 변경에 실패했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (pendingId) return;
    const previous = checklistItems;
    setPendingId(itemId);
    setError(null);
    setChecklistItems((current) => current.filter((item) => item.id !== itemId));

    try {
      await deleteChecklistItem(itemId, projectId);
      router.refresh();
      toast.success("체크리스트 항목을 삭제했습니다.");
    } catch (err) {
      setChecklistItems(previous);
      const message = err instanceof Error ? err.message : "항목 삭제에 실패했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {checklistItems.length === 0 && <p className="text-sm text-muted-foreground">체크리스트 항목이 없습니다.</p>}
      {checklistItems.map((item) => (
        <div key={item.id} className="flex items-center gap-3 group">
          <button
            type="button"
            onClick={() => void handleToggle(item.id)}
            disabled={pendingId !== null}
            aria-label={`${item.content} ${item.isDone ? "완료 해제" : "완료 처리"}`}
            aria-pressed={item.isDone}
            className={cn(
              "w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors disabled:opacity-60",
              item.isDone ? "bg-primary border-primary" : "border-border hover:border-primary"
            )}
          >
            {item.isDone && <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
          {editingId === item.id ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Input
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveEdit(item.id);
                  if (e.key === "Escape") handleCancelEdit();
                }}
                aria-label={`${item.content} 수정`}
                autoFocus
                disabled={pendingId !== null}
                className="h-8 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleSaveEdit(item.id)}
                disabled={pendingId !== null || !editingContent.trim()}
                aria-label="체크리스트 항목 수정 저장"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:opacity-40"
              >
                <Check size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={pendingId !== null}
                aria-label="체크리스트 항목 수정 취소"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span className={cn("min-w-0 flex-1 text-sm", item.isDone ? "line-through text-muted-foreground" : "text-foreground")}>
              {item.content}
            </span>
          )}
          {item.isDone && item.completedAt && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatCompletedDate(item.completedAt)}
            </span>
          )}
          {editingId !== item.id && (
          <button
            type="button"
            onClick={() => handleStartEdit(item)}
            disabled={pendingId !== null}
            aria-label={`${item.content} 수정`}
              title="내용 수정"
              className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground transition-opacity disabled:opacity-40"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleDelete(item.id)}
            disabled={pendingId !== null || editingId === item.id}
            aria-label={`${item.content} 삭제`}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive transition-opacity disabled:opacity-40"
          >
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
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          disabled={loading}
        />
        <Button type="button" onClick={() => void handleAdd()} disabled={loading || !newItem.trim()} size="sm" variant="outline" className="gap-1 shrink-0">
          <Plus size={14} /> 추가
        </Button>
      </div>
    </div>
  );
}
