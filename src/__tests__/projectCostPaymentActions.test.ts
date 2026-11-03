import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), transaction: vi.fn(), lock: vi.fn(), advisory: vi.fn(),
  find: vi.fn(), many: vi.fn(), upsert: vi.fn(), remove: vi.fn(), count: vi.fn(), update: vi.fn(), refresh: vi.fn(), edit: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.access, requireMenuEdit: m.edit }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { saveProjectCostPayment, deleteProjectCostPayment, setProjectCostSettled } from "@/app/actions/projectCostPayment";
import { deleteProjectAmount, updateProjectAmount } from "@/app/actions/projectAmount";

const user = { id: "staff", role: "member", active: true, partnerId: null, customerId: null, venueId: null };
const input = { id: "payment-1", amount: 100_000, paidDate: "2026-11-03", memo: "선금", settle: false };
beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ user }); m.access.mockResolvedValue(true);
  m.lock.mockResolvedValue([{ id: "cost-1" }]); m.find.mockResolvedValue(null); m.many.mockResolvedValue([]);
  m.count.mockResolvedValue(1); m.remove.mockResolvedValue({ count: 1 });
  m.transaction.mockImplementation(callback => callback({ $executeRaw: m.advisory, $queryRaw: m.lock,
    projectCostPayment: { findUnique: m.find, findMany: m.many, upsert: m.upsert, deleteMany: m.remove, count: m.count },
    projectAmount: { findUnique: m.find, update: m.update, delete: m.remove },
  }));
});

describe("지급 기록 저장 액션", () => {
  it("직원이 부분 지급을 저장해도 예정 매입과 매출 날짜는 바꾸지 않는다", async () => {
    await saveProjectCostPayment("project-1", "cost-1", input);
    expect(m.advisory.mock.invocationCallOrder[0]).toBeLessThan(m.lock.mock.invocationCallOrder[0]);
    expect(m.lock.mock.calls[0].slice(1)).toEqual(["cost-1", "project-1"]);
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: input.id }, create: expect.objectContaining({ projectAmountId: "cost-1", amount: 100_000, paidDate: "2026-11-03", createdById: "staff", updatedById: "staff" }),
    }));
    expect(m.update).toHaveBeenCalledWith({ where: { id: "cost-1" }, data: { costSettled: false } });
    expect(m.refresh).toHaveBeenCalledWith("/projects/project-1");
  });
  it("같은 ID로 재시도하면 추가 생성 대신 같은 기록에 upsert한다", async () => {
    m.find.mockResolvedValue({ projectAmountId: "cost-1" });
    await saveProjectCostPayment("project-1", "cost-1", input);
    await saveProjectCostPayment("project-1", "cost-1", { ...input, settle: true });
    expect(m.upsert.mock.calls.map(call => call[0].where)).toEqual([{ id: "payment-1" }, { id: "payment-1" }]);
    expect(m.update).toHaveBeenLastCalledWith({ where: { id: "cost-1" }, data: { costSettled: true } });
  });
  it("다른 프로젝트·매출·없는 매입에는 쓰지 않는다", async () => {
    m.lock.mockResolvedValue([]);
    await expect(saveProjectCostPayment("other-project", "cost-1", input)).rejects.toThrow("매입 건");
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("다른 매입의 지급 ID는 수정할 수 없다", async () => {
    m.find.mockResolvedValue({ projectAmountId: "other-cost" });
    await expect(saveProjectCostPayment("project-1", "cost-1", input)).rejects.toThrow("지급 기록");
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("잘못된 금액·날짜는 트랜잭션 전에 거부한다", async () => {
    await expect(saveProjectCostPayment("project-1", "cost-1", { ...input, paidDate: "2026-02-30" })).rejects.toThrow();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each([null, { ...user, active: false }, { ...user, role: "partner" }, { ...user, role: "dot" },
    { ...user, role: "admin", partnerId: "partner-1" }, { ...user, customerId: "customer-1" }, { ...user, venueId: "venue-1" }])("외부·비활성·미로그인은 저장·삭제·정산 모두 DB 전에 차단한다: %j", async actor => {
    m.session.mockResolvedValue(actor ? { user: actor } : null);
    await expect(saveProjectCostPayment("p", "c", input)).rejects.toThrow();
    await expect(deleteProjectCostPayment("p", "c", "payment-1")).rejects.toThrow();
    await expect(setProjectCostSettled("p", "c", true)).rejects.toThrow();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("프로젝트 열람 권한이 없는 직원도 차단한다", async () => {
    m.access.mockResolvedValue(false);
    await expect(saveProjectCostPayment("p", "c", input)).rejects.toThrow("내부 직원");
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("누적 금액이 안전한 정수 범위를 넘으면 거부한다", async () => {
    m.many.mockResolvedValue([{ id: "other", amount: Number.MAX_SAFE_INTEGER }]);
    await expect(saveProjectCostPayment("p", "c", input)).rejects.toThrow("지원 범위");
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("기록 삭제는 해당 매입으로 제한하고 정산을 해제한다", async () => {
    await deleteProjectCostPayment("p", "c", "payment-1");
    expect(m.remove).toHaveBeenCalledWith({ where: { id: "payment-1", projectAmountId: "c" } });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { costSettled: false } });
  });
  it("지급 없는 정산 완료는 차단하지만 해제는 가능하다", async () => {
    m.count.mockResolvedValue(0);
    await expect(setProjectCostSettled("p", "c", true)).rejects.toThrow("먼저 등록");
    await setProjectCostSettled("p", "c", false);
    expect(m.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { costSettled: false } });
  });
  it("지급 기록이 있는 매입의 삭제와 매출 전환을 막는다", async () => {
    m.find.mockResolvedValue({ id: "c", projectId: "p", kind: "cost", payments: [{ id: "payment-1" }] });
    await expect(deleteProjectAmount("c", "p")).rejects.toThrow("지급 기록");
    await expect(updateProjectAmount("c", "p", { kind: "revenue", amount: 1000 })).rejects.toThrow("지급 기록");
    expect(m.remove).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
});
