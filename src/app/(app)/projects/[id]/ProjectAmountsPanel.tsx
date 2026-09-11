"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProjectAmount,
  deleteProjectAmount,
  updateProjectAmount,
  type ProjectAmountInput,
} from "@/app/actions/projectAmount";
import {
  calculateNetIncome,
  calculateOperatingProfit,
} from "@/lib/financeMetrics";
import type { ProjectAmountKind } from "@/lib/projectAmounts";

interface ProjectAmount {
  id: string;
  kind: string;
  amount: number;
  label: string | null;
  memo: string | null;
  sourceFileName: string | null;
}

interface Props {
  projectId: string;
  amounts: ProjectAmount[];
  canEdit: boolean;
}

interface Draft {
  kind: ProjectAmountKind;
  amount: string;
  label: string;
  memo: string;
}

function emptyDraft(kind: ProjectAmountKind = "revenue"): Draft {
  return { kind, amount: "", label: "", memo: "" };
}

function formatAmount(value: number | null): string {
  return value === null ? "미입력" : `${value.toLocaleString("ko-KR")}원`;
}

function subtotal(amounts: ProjectAmount[], kind: ProjectAmountKind): number | null {
  const matching = amounts.filter((amount) => amount.kind === kind);
  return matching.length === 0 ? null : matching.reduce((sum, amount) => sum + amount.amount, 0);
}

export function ProjectAmountsPanel({ projectId, amounts, canEdit }: Props) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [deleteTarget, setDeleteTarget] = useState<ProjectAmount | null>(null);
  const [isPending, startTransition] = useTransition();

  const revenue = subtotal(amounts, "revenue");
  const cost = subtotal(amounts, "cost");
  const operatingProfit = calculateOperatingProfit(revenue, cost);
  const netIncome = calculateNetIncome(revenue, cost);

  const openCreate = (kind: ProjectAmountKind) => {
    setEditingId(null);
    setDraft(emptyDraft(kind));
    setEditorOpen(true);
  };

  const openEdit = (amount: ProjectAmount) => {
    if (amount.kind !== "revenue" && amount.kind !== "cost") return;
    setEditingId(amount.id);
    setDraft({
      kind: amount.kind,
      amount: String(amount.amount),
      label: amount.label ?? "",
      memo: amount.memo ?? "",
    });
    setEditorOpen(true);
  };

  const saveAmount = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.amount.trim()) {
      toast.error("금액을 입력해 주세요.");
      return;
    }

    const input: ProjectAmountInput = {
      kind: draft.kind,
      amount: Number(draft.amount.replace(/,/g, "")),
      label: draft.label,
      memo: draft.memo,
    };
    startTransition(async () => {
      try {
        if (editingId) {
          await updateProjectAmount(editingId, projectId, input);
          toast.success("매출·매입 건을 수정했습니다.");
        } else {
          await createProjectAmount(projectId, input);
          toast.success("매출·매입 건을 추가했습니다.");
        }
        setEditorOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
      }
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteProjectAmount(deleteTarget.id, projectId);
        toast.success("매출·매입 건을 삭제했습니다.");
        setDeleteTarget(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <AmountSection
          title="매출"
          kind="revenue"
          amounts={amounts}
          total={revenue}
          canEdit={canEdit}
          pending={isPending}
          onCreate={openCreate}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
        <AmountSection
          title="매입"
          kind="cost"
          amounts={amounts}
          total={cost}
          canEdit={canEdit}
          pending={isPending}
          onCreate={openCreate}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      </div>

      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <Metric label="영업이익" value={operatingProfit} />
        <Metric label="당기순이익" value={netIncome} />
        <div className="rounded-lg bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          <p>집계 기준</p>
          <p className="mt-1 font-medium text-foreground">매출 합계 − 매입 합계</p>
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={(open) => { if (!isPending) setEditorOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "매출·매입 건 수정" : "매출·매입 건 추가"}</DialogTitle>
            <DialogDescription>금액은 원 단위 정수로 입력합니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveAmount} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-amount-kind">구분</Label>
              <select
                id="project-amount-kind"
                value={draft.kind}
                onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as ProjectAmountKind }))}
                disabled={isPending}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="revenue">매출</option>
                <option value="cost">매입</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-amount-value">금액 (원)</Label>
              <Input
                id="project-amount-value"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={draft.amount}
                onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                placeholder="0"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-amount-label">이름</Label>
              <Input
                id="project-amount-label"
                value={draft.label}
                onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                placeholder="예: 2차 매출, 추가 매입"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-amount-memo">비고</Label>
              <Textarea
                id="project-amount-memo"
                value={draft.memo}
                onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))}
                rows={3}
                disabled={isPending}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={isPending}>취소</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "저장 중..." : "저장"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !isPending) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>매출·매입 건 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget?.label ? `‘${deleteTarget.label}’ 건을 ` : "이 건을 "}삭제하시겠습니까? 삭제하면 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>취소</Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={isPending}>
              {isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AmountSection({
  title,
  kind,
  amounts,
  total,
  canEdit,
  pending,
  onCreate,
  onEdit,
  onDelete,
}: {
  title: string;
  kind: ProjectAmountKind;
  amounts: ProjectAmount[];
  total: number | null;
  canEdit: boolean;
  pending: boolean;
  onCreate: (kind: ProjectAmountKind) => void;
  onEdit: (amount: ProjectAmount) => void;
  onDelete: (amount: ProjectAmount) => void;
}) {
  const items = amounts.filter((amount) => amount.kind === kind);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-background p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">소계 {formatAmount(total)}</p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1" onClick={() => onCreate(kind)} disabled={pending}>
            <Plus className="size-3.5" /> 추가
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">등록된 {title} 건이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map((amount) => (
            <article key={amount.id} className="rounded-lg border border-border/80 bg-card p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {amount.label && <p className="break-words text-sm font-medium text-foreground">{amount.label}</p>}
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{formatAmount(amount.amount)}</p>
                  {amount.memo && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{amount.memo}</p>}
                  {amount.sourceFileName && (
                    <p className="mt-2 break-all text-xs text-muted-foreground">견적서 · {amount.sourceFileName}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" onClick={() => onEdit(amount)} disabled={pending} aria-label="매출·매입 건 수정">
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40" onClick={() => onDelete(amount)} disabled={pending} aria-label="매출·매입 건 삭제">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${value !== null && value < 0 ? "text-destructive" : "text-foreground"}`}>
        {formatAmount(value)}
      </p>
    </div>
  );
}
