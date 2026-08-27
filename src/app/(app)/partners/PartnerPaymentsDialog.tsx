"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addPartnerPayment,
  deletePartnerPayment,
  updatePartnerPayment,
} from "@/app/actions/partnerPayment";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarizeRates } from "@/lib/partnerRateStats";

export interface ProjectOption {
  id: string;
  name: string;
}

export interface PaymentRateRow {
  item: string;
  amount: number;
  unit: string;
}

export interface PartnerPaymentRow {
  id: string;
  item: string;
  amount: number;
  unit: string;
  quantity: number;
  paidOn: string | null;
  memo: string | null;
  projectId: string | null;
  projectName: string | null;
}

type PaymentFormState = {
  item: string;
  amount: string;
  unit: string;
  quantity: string;
  projectId: string;
  paidOn: string;
  memo: string;
};

const PAYMENT_UNITS = ["건당", "일당", "시간당"];
const SELECT_CLASS =
  "h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

const EMPTY_PAYMENT: PaymentFormState = {
  item: "",
  amount: "",
  unit: "건당",
  quantity: "1",
  projectId: "",
  paidOn: "",
  memo: "",
};

function toPaymentForm(payment: PartnerPaymentRow): PaymentFormState {
  return {
    item: payment.item,
    amount: String(payment.amount),
    unit: payment.unit,
    quantity: String(payment.quantity),
    projectId: payment.projectId ?? "",
    paidOn: payment.paidOn ?? "",
    memo: payment.memo ?? "",
  };
}

function formatAmount(amount: number | null) {
  return amount === null ? "-" : `${amount.toLocaleString()}원`;
}

function formatRange(min: number | null, max: number | null) {
  if (min === null || max === null) return "-";
  return min === max ? formatAmount(min) : `${formatAmount(min)} ~ ${formatAmount(max)}`;
}

function averageClassName(ratio: number | null) {
  if (ratio !== null && ratio > 1.1) return "font-semibold text-destructive";
  if (ratio !== null && ratio < 0.9) return "text-muted-foreground";
  return "text-foreground";
}

function ProjectSelect({
  id,
  value,
  projects,
  onChange,
}: {
  id: string;
  value: string;
  projects: ProjectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} className={`${SELECT_CLASS} w-full`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">프로젝트 없음</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>{project.name}</option>
      ))}
    </select>
  );
}

export function PartnerPaymentsDialog({
  open,
  partnerId,
  partnerName,
  rates,
  initialPayments,
  projects,
  onClose,
}: {
  open: boolean;
  partnerId: string;
  partnerName: string;
  rates: PaymentRateRow[];
  initialPayments: PartnerPaymentRow[];
  projects: ProjectOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [payments, setPayments] = useState(() => initialPayments.map(toPaymentForm));
  const [newPayment, setNewPayment] = useState<PaymentFormState>({ ...EMPTY_PAYMENT });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const stats = useMemo(
    () => summarizeRates(
      rates,
      payments.map((payment) => ({
        item: payment.item,
        amount: Number(payment.amount),
        unit: payment.unit,
        quantity: Number(payment.quantity),
        paidOn: payment.paidOn || null,
      })),
    ),
    [payments, rates],
  );

  const setPayment = (id: string, key: keyof PaymentFormState, value: string) => {
    setPayments((current) => current.map((payment, index) => (
      String(index) === id ? { ...payment, [key]: value } : payment
    )));
  };

  async function handlePaymentSave(index: number, payment: PaymentFormState) {
    const original = initialPayments[index];
    if (!original) return;
    setSavingId(original.id);
    try {
      await updatePartnerPayment(original.id, {
        item: payment.item,
        amount: Number(payment.amount),
        unit: payment.unit,
        quantity: Number(payment.quantity),
        projectId: payment.projectId,
        paidOn: payment.paidOn,
        memo: payment.memo,
      });
      toast.success("지급 이력을 수정했습니다.");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSavingId(null);
    }
  }

  async function handlePaymentAdd() {
    setAdding(true);
    try {
      await addPartnerPayment(partnerId, {
        item: newPayment.item,
        amount: Number(newPayment.amount),
        unit: newPayment.unit,
        quantity: Number(newPayment.quantity),
        projectId: newPayment.projectId,
        paidOn: newPayment.paidOn,
        memo: newPayment.memo,
      });
      toast.success("지급 이력을 추가했습니다.");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setAdding(false);
    }
  }

  async function handlePaymentDelete(index: number) {
    const original = initialPayments[index];
    if (!original || !window.confirm(`'${original.item}' 지급 이력을 삭제하시겠습니까?`)) return;
    setSavingId(original.id);
    try {
      await deletePartnerPayment(original.id);
      toast.success("지급 이력을 삭제했습니다.");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{partnerName} 실제 지급 이력</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">항목별 요약</p>
            {stats.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                등록 단가와 지급 이력이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>작업</TableHead>
                      <TableHead>등록 단가</TableHead>
                      <TableHead>실제 평균</TableHead>
                      <TableHead>건수</TableHead>
                      <TableHead>최소~최대</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.map((stat) => (
                      <TableRow key={`${stat.item}-${stat.unit}`}>
                        <TableCell>
                          <div>{stat.item}</div>
                          <div className="text-xs text-muted-foreground">{stat.unit}</div>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatAmount(stat.rate)}</TableCell>
                        <TableCell className={`tabular-nums ${averageClassName(stat.ratio)}`}>
                          {formatAmount(stat.average)}
                        </TableCell>
                        <TableCell className="tabular-nums">{stat.count}건</TableCell>
                        <TableCell className="tabular-nums">{formatRange(stat.min, stat.max)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">지급 이력</p>
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)_3rem_2rem] gap-2 px-1 text-xs text-muted-foreground sm:grid">
              <span>작업 이름</span>
              <span>금액</span>
              <span>단위</span>
              <span>수량</span>
              <span>프로젝트</span>
              <span>지급일</span>
              <span>비고</span>
              <span>저장</span>
              <span>삭제</span>
            </div>
            {payments.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                등록된 지급 이력이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {payments.map((payment, index) => {
                  const original = initialPayments[index];
                  const canSave = payment.item.trim() && Number(payment.amount) > 0 && Number(payment.quantity) >= 1;
                  return (
                    <div
                      key={original.id}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)_3rem_2rem] sm:border-0 sm:p-0"
                    >
                      <div>
                        <Label htmlFor={`payment-item-${original.id}`} className="sr-only">작업 이름</Label>
                        <Input
                          id={`payment-item-${original.id}`}
                          value={payment.item}
                          onChange={(e) => setPayment(String(index), "item", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`payment-amount-${original.id}`} className="sr-only">금액</Label>
                        <Input
                          id={`payment-amount-${original.id}`}
                          inputMode="numeric"
                          value={payment.amount}
                          onChange={(e) => setPayment(String(index), "amount", e.target.value.replace(/[^0-9]/g, ""))}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`payment-unit-${original.id}`} className="sr-only">단위</Label>
                        <select
                          id={`payment-unit-${original.id}`}
                          className={`${SELECT_CLASS} w-full`}
                          value={payment.unit}
                          onChange={(e) => setPayment(String(index), "unit", e.target.value)}
                        >
                          {PAYMENT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`payment-quantity-${original.id}`} className="sr-only">수량</Label>
                        <Input
                          id={`payment-quantity-${original.id}`}
                          inputMode="numeric"
                          value={payment.quantity}
                          onChange={(e) => setPayment(String(index), "quantity", e.target.value.replace(/[^0-9]/g, ""))}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`payment-project-${original.id}`} className="sr-only">프로젝트</Label>
                        <ProjectSelect
                          id={`payment-project-${original.id}`}
                          value={payment.projectId}
                          projects={projects}
                          onChange={(value) => setPayment(String(index), "projectId", value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`payment-paid-on-${original.id}`} className="sr-only">지급일</Label>
                        <Input
                          id={`payment-paid-on-${original.id}`}
                          type="date"
                          value={payment.paidOn}
                          onChange={(e) => setPayment(String(index), "paidOn", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`payment-memo-${original.id}`} className="sr-only">비고</Label>
                        <Input
                          id={`payment-memo-${original.id}`}
                          value={payment.memo}
                          onChange={(e) => setPayment(String(index), "memo", e.target.value)}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePaymentSave(index, payment)}
                        disabled={savingId !== null || !canSave}
                      >
                        저장
                      </Button>
                      <button
                        type="button"
                        onClick={() => handlePaymentDelete(index)}
                        disabled={savingId !== null}
                        className="flex h-7 items-center justify-center text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        title="삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">새 지급 이력 추가</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)_3rem]">
              <div>
                <Label htmlFor="payment-new-item" className="sr-only">작업 이름</Label>
                <Input
                  id="payment-new-item"
                  placeholder="예: 포스터"
                  value={newPayment.item}
                  onChange={(e) => setNewPayment((current) => ({ ...current, item: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="payment-new-amount" className="sr-only">금액</Label>
                <Input
                  id="payment-new-amount"
                  inputMode="numeric"
                  placeholder="500000"
                  value={newPayment.amount}
                  onChange={(e) => setNewPayment((current) => ({ ...current, amount: e.target.value.replace(/[^0-9]/g, "") }))}
                />
              </div>
              <div>
                <Label htmlFor="payment-new-unit" className="sr-only">단위</Label>
                <select
                  id="payment-new-unit"
                  className={`${SELECT_CLASS} w-full`}
                  value={newPayment.unit}
                  onChange={(e) => setNewPayment((current) => ({ ...current, unit: e.target.value }))}
                >
                  {PAYMENT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="payment-new-quantity" className="sr-only">수량</Label>
                <Input
                  id="payment-new-quantity"
                  inputMode="numeric"
                  value={newPayment.quantity}
                  onChange={(e) => setNewPayment((current) => ({ ...current, quantity: e.target.value.replace(/[^0-9]/g, "") }))}
                />
              </div>
              <div>
                <Label htmlFor="payment-new-project" className="sr-only">프로젝트</Label>
                <ProjectSelect
                  id="payment-new-project"
                  value={newPayment.projectId}
                  projects={projects}
                  onChange={(value) => setNewPayment((current) => ({ ...current, projectId: value }))}
                />
              </div>
              <div>
                <Label htmlFor="payment-new-paid-on" className="sr-only">지급일</Label>
                <Input
                  id="payment-new-paid-on"
                  type="date"
                  value={newPayment.paidOn}
                  onChange={(e) => setNewPayment((current) => ({ ...current, paidOn: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="payment-new-memo" className="sr-only">비고</Label>
                <Input
                  id="payment-new-memo"
                  placeholder="비고"
                  value={newPayment.memo}
                  onChange={(e) => setNewPayment((current) => ({ ...current, memo: e.target.value }))}
                />
              </div>
              <Button
                size="sm"
                onClick={handlePaymentAdd}
                disabled={adding || !newPayment.item.trim() || Number(newPayment.amount) <= 0 || Number(newPayment.quantity) < 1}
              >
                <Plus className="size-3.5" /> 추가
              </Button>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={adding || savingId !== null}>
              닫기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
