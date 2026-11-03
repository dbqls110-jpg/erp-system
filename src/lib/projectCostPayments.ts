import type { Session } from "next-auth";
import type { ProjectAmount, ProjectCostPayment } from "@prisma/client";
import { isExternal } from "@/lib/calendarVisibility";
import { parseRevenueDates } from "@/lib/revenueDates";

type Actor = Pick<Session["user"], "id" | "role" | "active" | "partnerId" | "customerId" | "venueId">;
export function canManageCostPayments(user: Actor | null | undefined): boolean {
  return Boolean(user && user.active === true && ["admin", "manager", "member", "user"].includes(user.role)
    && !isExternal(user));
}

export type CostPayment = Pick<ProjectCostPayment, "id" | "amount" | "paidDate" | "memo">;
export type CostPaymentItem = Pick<ProjectAmount, "amount"> & {
  costSettled?: boolean;
  payments?: CostPayment[];
};
export interface CostPaymentInput {
  id: string;
  amount: number;
  paidDate: string;
  memo: string;
  settle: boolean;
}

export function parseCostPayment(input: CostPaymentInput) {
  if (!input || typeof input !== "object") throw new Error("지급 기록을 확인해 주세요.");
  if (typeof input.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(input.id)) throw new Error("지급 기록 ID가 올바르지 않습니다.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("지급액은 0보다 큰 원 단위 정수로 입력해 주세요.");
  const date = parseRevenueDates({ paidDate: input.paidDate }).paidDate;
  if (!date) throw new Error("실제 지급일을 입력해 주세요.");
  if (typeof input.memo !== "string" || input.memo.length > 2000) throw new Error("지급 메모는 2,000자 이내로 입력해 주세요.");
  if (typeof input.settle !== "boolean") throw new Error("정산 완료 여부를 확인해 주세요.");
  return { id: input.id, amount: input.amount, paidDate: date, memo: input.memo.trim() || null, settle: input.settle };
}

export function costPaymentMetrics(item: CostPaymentItem) {
  const paid = (item.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  return {
    planned: item.amount, paid,
    remaining: item.costSettled ? 0 : Math.max(0, item.amount - paid),
    difference: paid - item.amount,
    status: item.costSettled ? "정산 완료" : paid === 0 ? "미지급" : paid >= item.amount ? "예정액 지급" : "부분 지급",
  };
}

export function totalCostPayments(items: CostPaymentItem[]) {
  return items.reduce((total, item) => {
    const metrics = costPaymentMetrics(item);
    return { planned: total.planned + metrics.planned, paid: total.paid + metrics.paid, remaining: total.remaining + metrics.remaining };
  }, { planned: 0, paid: 0, remaining: 0 });
}
