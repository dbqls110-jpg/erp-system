"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckSquare, Square, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  checkFixedExpense,
  uncheckFixedExpense,
} from "@/app/actions/fixedExpense";

const CATEGORY_LABELS: Record<string, string> = {
  rent: "임차료", salary: "인건비", telecom: "통신비",
  supplies: "비품", food: "식대", software: "소프트웨어",
  insurance: "4대보험", other: "기타",
};

interface FixedExpenseItem {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;
  category: string;
}

interface Props {
  items: FixedExpenseItem[];
  checkedIds: Set<string>;
  year: number;
  month: number;
  isAdmin: boolean;
}

export function FixedExpensePanel({ items, checkedIds, year, month, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // form state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [category, setCategory] = useState("other");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingId(null);
    setName(""); setAmount(""); setDayOfMonth("1"); setCategory("other");
    setOpen(true);
  }

  function openEdit(item: FixedExpenseItem) {
    setEditingId(item.id);
    setName(item.name);
    setAmount(String(item.amount));
    setDayOfMonth(String(item.dayOfMonth));
    setCategory(item.category);
    setOpen(true);
  }

  function handleCheck(item: FixedExpenseItem, checked: boolean) {
    setPendingId(item.id);
    startTransition(async () => {
      try {
        if (checked) {
          await checkFixedExpense(item.id, year, month);
          toast.success(`"${item.name}" 납부 처리됐습니다.`);
        } else {
          await uncheckFixedExpense(item.id, year, month);
          toast.success(`"${item.name}" 납부 취소됐습니다.`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리 실패");
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleDelete(item: FixedExpenseItem) {
    setPendingId(item.id);
    startTransition(async () => {
      try {
        await deleteFixedExpense(item.id);
        toast.success(`"${item.name}" 삭제됐습니다.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      } finally {
        setPendingId(null);
      }
    });
  }

  async function handleSave() {
    if (!name.trim() || !amount) return;
    setSaving(true);
    try {
      const data = { name: name.trim(), amount: parseFloat(amount), dayOfMonth: parseInt(dayOfMonth), category };
      if (editingId) {
        await updateFixedExpense(editingId, data);
        toast.success("수정됐습니다.");
      } else {
        await createFixedExpense(data);
        toast.success("고정비 항목이 추가됐습니다.");
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const totalFixed = items.reduce((s, i) => s + i.amount, 0);
  const checkedTotal = items.filter(i => checkedIds.has(i.id)).reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className="space-y-1">
        {items.length === 0 ? (
          <p className="text-sm text-smoke-gray py-2">등록된 고정비 항목이 없습니다.</p>
        ) : (
          <>
            {items.map((item) => {
              const checked = checkedIds.has(item.id);
              const pending = isPending && pendingId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCheck(item, !checked)}
                      disabled={pending}
                      className="text-smoke-gray hover:text-deep-violet transition-colors disabled:opacity-50 shrink-0"
                    >
                      {checked
                        ? <CheckSquare size={18} className="text-deep-violet" />
                        : <Square size={18} />
                      }
                    </button>
                    <span className={`font-medium ${checked ? "line-through text-smoke-gray" : "text-midnight-charcoal"}`}>
                      {item.name}
                    </span>
                    <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[item.category]}</Badge>
                    <span className="text-smoke-gray text-xs">매달 {item.dayOfMonth}일</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${checked ? "text-smoke-gray line-through" : ""}`}>
                      {item.amount.toLocaleString()}원
                    </span>
                    {isAdmin && (
                      <>
                        <button onClick={() => openEdit(item)} disabled={pending} className="text-smoke-gray hover:text-deep-violet transition-colors disabled:opacity-50">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(item)} disabled={pending} className="text-smoke-gray hover:text-destructive transition-colors disabled:opacity-50">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-2 text-sm font-medium">
              <span className="text-smoke-gray">
                납부 완료 {items.filter(i => checkedIds.has(i.id)).length}/{items.length}건
              </span>
              <span>
                <span className="text-deep-violet">{checkedTotal.toLocaleString()}원</span>
                <span className="text-smoke-gray"> / {totalFixed.toLocaleString()}원</span>
              </span>
            </div>
          </>
        )}

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={openCreate}
            className="gap-1.5 mt-2"
          >
            <Plus size={13} /> 고정비 항목 추가
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "고정비 수정" : "고정비 항목 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>항목명</Label>
              <Input placeholder="예: 사무실 임차료" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>금액 (원)</Label>
              <Input type="number" placeholder="0" min="0" step="10000" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>납부일</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={e => setDayOfMonth(e.target.value)}
                  placeholder="15"
                />
              </div>
              <div className="space-y-1.5">
                <Label>분류</Label>
                <Select value={category} onValueChange={(v) => { if (v) setCategory(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>취소</Button>
              <Button size="sm" onClick={handleSave} disabled={!name.trim() || !amount || saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
