import { describe, expect, it } from "vitest";
import { canManageCostPayments, costPaymentMetrics, parseCostPayment, totalCostPayments } from "@/lib/projectCostPayments";

const staff = { id: "staff", role: "member", active: true, partnerId: null, customerId: null, venueId: null };
const payment = { id: "payment-1", amount: 100_000, paidDate: "2026-11-03", memo: "선금", settle: false };

describe("매입 지급 계산", () => {
  it("기존 예정 매입을 지급 완료로 간주하지 않는다", () => {
    expect(costPaymentMetrics({ amount: 330_000 })).toMatchObject({ paid: 0, remaining: 330_000, status: "미지급" });
  });
  it("여러 지급과 정산 완료 시 할인된 최종 지급액을 구분한다", () => {
    const item = { amount: 330_000, payments: [payment, { ...payment, id: "payment-2", amount: 200_000 }] };
    expect(costPaymentMetrics(item)).toMatchObject({ paid: 300_000, remaining: 30_000, status: "부분 지급" });
    expect(costPaymentMetrics({ ...item, costSettled: true })).toMatchObject({ paid: 300_000, remaining: 0, difference: -30_000, status: "정산 완료" });
  });
  it("예정액 이상 지급 시 음수 미지급액을 만들지 않는다", () => {
    expect(costPaymentMetrics({ amount: 50_000, payments: [payment] })).toMatchObject({ paid: 100_000, remaining: 0, difference: 50_000 });
  });
  it("합계는 매입마다 미지급액을 계산하여 서로 상계하지 않는다", () => {
    expect(totalCostPayments([{ amount: 50_000, payments: [payment] }, { amount: 200_000 }])).toEqual({ planned: 250_000, paid: 100_000, remaining: 200_000 });
    expect(totalCostPayments([])).toEqual({ planned: 0, paid: 0, remaining: 0 });
  });
});

describe("지급 입력 검증", () => {
  it("지급일과 원 단위 금액을 검증하며 메모 공백을 정리한다", () => {
    expect(parseCostPayment({ ...payment, memo: "  잔금  " })).toMatchObject({ memo: "잔금", paidDate: "2026-11-03" });
  });
  it.each([0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("잘못된 금액을 거부한다: %s", amount => {
    expect(() => parseCostPayment({ ...payment, amount })).toThrow();
  });
  it.each(["", "2026-02-30", "11/03/2026", "2026-11-03T00:00:00Z"])("잘못된 지급일을 거부한다: %s", paidDate => {
    expect(() => parseCostPayment({ ...payment, paidDate })).toThrow();
  });
});

describe("내부 직원 지급 권한", () => {
  it.each(["admin", "manager", "member", "user"])("활성 내부 직원 %s를 허용한다", role => {
    expect(canManageCostPayments({ ...staff, role })).toBe(true);
  });
  it.each([
    { ...staff, active: false }, { ...staff, role: "partner" }, { ...staff, role: "host" },
    { ...staff, role: "dot" }, { ...staff, role: "pending" },
    { ...staff, role: "admin", partnerId: "partner-1" }, { ...staff, customerId: "customer-1" }, { ...staff, venueId: "venue-1" }, null,
  ])("외부 연결·비활성·비직원은 거부한다: %j", user => {
    expect(canManageCostPayments(user)).toBe(false);
  });
});
