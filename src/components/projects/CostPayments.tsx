"use client";

import { useState, useTransition, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { costPaymentMetrics, type CostPaymentItem, type CostPayment } from "@/lib/projectCostPayments";
import { saveProjectCostPayment, deleteProjectCostPayment, setProjectCostSettled } from "@/app/actions/projectCostPayment";

function money(value: number) { return `${value.toLocaleString("ko-KR")}원`; }
type Item = CostPaymentItem & { id: string; label: string | null };

export function CostPayments({ projectId, item, canManage }: { projectId: string; item: Item; canManage: boolean }) {
  const metrics = costPaymentMetrics(item);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return <div className="mt-3 space-y-2 border-t pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className={item.costSettled ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{metrics.status}</span>
      <span>실제 지급 <strong>{money(metrics.paid)}</strong> · 미지급 {money(metrics.remaining)}</span>
    </div>
    {item.costSettled && metrics.difference !== 0 && <p className="text-xs text-muted-foreground">예정 대비 {metrics.difference > 0 ? "초과 지급" : "절감"} {money(Math.abs(metrics.difference))}</p>}
    {canManage && <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>지급 기록 / 정산</Button>}
    {!canManage && item.payments?.map(payment => <p className="text-xs text-muted-foreground" key={payment.id}>{payment.paidDate} · {money(payment.amount)}{payment.memo ? ` · ${payment.memo}` : ""}</p>)}
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
      {open && <PaymentEditor projectId={projectId} item={item} close={() => setOpen(false)} pending={pending} startTransition={startTransition} />}
    </Dialog>
  </div>;
}

function PaymentEditor({ projectId, item, close, pending, startTransition }: { projectId: string; item: Item; close: () => void; pending: boolean; startTransition: TransitionStartFunction }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CostPayment | null>(null);
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [settle, setSettle] = useState(Boolean(item.costSettled));
  const [deleteTarget, setDeleteTarget] = useState<CostPayment | null>(null);
  const metrics = costPaymentMetrics(item);

  function run(action: () => Promise<void>, message: string) {
    startTransition(async () => {
      try { await action(); toast.success(message); close(); router.refresh(); }
      catch (error) { toast.error(error instanceof Error ? error.message : "지급 기록 저장에 실패했습니다."); }
    });
  }
  function edit(payment: CostPayment) {
    setEditing(payment); setPaymentId(payment.id); setAmount(String(payment.amount)); setMemo(payment.memo ?? ""); setDeleteTarget(null);
  }
  function reset() { setEditing(null); setPaymentId(crypto.randomUUID()); setAmount(""); setMemo(""); }
  return <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!pending}>
    <DialogHeader>
      <DialogTitle>{item.label ?? "매입"} · 지급 기록</DialogTitle>
      <DialogDescription>예정 금액은 유지됩니다. 여러 번 나누어 지급한 금액과 실제 지급일을 각각 기록하세요.</DialogDescription>
    </DialogHeader>
    <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-xs">
      <p>예정 매입<br /><strong>{money(metrics.planned)}</strong></p>
      <p>실제 지급<br /><strong>{money(metrics.paid)}</strong></p>
      <p>미지급 잔액<br /><strong>{money(metrics.remaining)}</strong></p>
    </div>
    <div className="space-y-2">
      {(item.payments ?? []).map(payment => <div key={payment.id} className="rounded-lg border p-3 text-sm">
        <p>{payment.paidDate} · <strong>{money(payment.amount)}</strong></p>
        {payment.memo && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{payment.memo}</p>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => edit(payment)} disabled={pending}>수정</Button>
          <Button size="sm" variant="outline" onClick={() => setDeleteTarget(payment)} disabled={pending}>지급 기록 삭제</Button>
        </div>
      </div>)}
      {!item.payments?.length && <p className="text-sm text-muted-foreground">아직 지급 기록이 없습니다. 기존 예정 매입을 지급 완료로 간주하지 않습니다.</p>}
    </div>
    {deleteTarget && <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3 text-sm">
      <p>{deleteTarget.paidDate} · {money(deleteTarget.amount)} 지급 기록을 삭제할까요? 삭제하면 정산 완료가 해제됩니다.</p>
      <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(() => deleteProjectCostPayment(projectId, item.id, deleteTarget.id), "지급 기록을 삭제했습니다.")}>삭제 확인</Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setDeleteTarget(null)}>취소</Button>
    </div>}
    <form className="space-y-3 border-t pt-3" onSubmit={event => {
      event.preventDefault();
      const paidDate = new FormData(event.currentTarget).get("paidDate");
      if (typeof paidDate !== "string" || !paidDate) { toast.error("실제 지급일을 입력해 주세요."); return; }
      run(() => saveProjectCostPayment(projectId, item.id, { id: paymentId, amount: Number(amount), paidDate, memo, settle }), "지급 기록을 저장했습니다.");
    }}>
      <p className="text-sm font-medium">{editing ? "지급 기록 수정" : "지급 기록 추가"}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label htmlFor="cost-payment-amount">실제 지급액 (원)</Label><Input id="cost-payment-amount" type="number" min="1" step="1" required value={amount} onChange={e => setAmount(e.target.value)} disabled={pending} /></div>
        <div className="space-y-1"><Label htmlFor="cost-payment-date">실제 지급일</Label><Input key={paymentId} id="cost-payment-date" name="paidDate" type="date" required min="1900-01-01" max="2200-12-31" defaultValue={editing?.paidDate ?? ""} disabled={pending} /></div>
      </div>
      <Label htmlFor="cost-payment-memo">지급 메모</Label><Input id="cost-payment-memo" maxLength={2000} value={memo} onChange={e => setMemo(e.target.value)} disabled={pending} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settle} disabled={pending} onChange={e => setSettle(e.target.checked)} />이 기록을 저장하면 정산 완료 (추가 지급 없음)</label>
      <p className="text-xs text-muted-foreground">정산 완료 시 예정액과 차이가 있어도 미지급 잔액은 0원입니다. 초과 지급도 기록할 수 있습니다.</p>
      <div className="flex justify-end gap-2">
        {editing && <Button type="button" variant="outline" disabled={pending} onClick={reset}>새 지급 추가로 전환</Button>}
        <Button type="submit" disabled={pending}>{pending ? "저장 중..." : editing ? "지급 수정 저장" : "지급 추가 저장"}</Button>
      </div>
    </form>
    <DialogFooter className="border-t pt-3">
      <Button type="button" variant="outline" disabled={pending || !item.payments?.length} onClick={() => run(() => setProjectCostSettled(projectId, item.id, !item.costSettled), item.costSettled ? "정산 완료를 해제했습니다." : "정산 완료했습니다.")}>{item.costSettled ? "정산 완료 해제" : "기존 지급액으로 정산 완료"}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={close}>닫기</Button>
    </DialogFooter>
  </DialogContent>;
}
