import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), permission: vi.fn(), entryUpdate: vi.fn(), entryCreate: vi.fn(), find: vi.fn(), update: vi.fn(), revalidate: vi.fn(), transaction: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ requireMenuEdit: m.permission }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: m.transaction, companyFinanceEntry: { updateMany: m.entryUpdate, create: m.entryCreate }, projectAmount: { findUnique: m.find, updateMany: m.update } } }));
import { updateRevenueDates } from "@/app/actions/revenueDates";
import { addCompanyFinanceEntry } from "@/app/actions/companyFinance";
import { createProjectAmount, updateProjectAmount } from "@/app/actions/projectAmount";

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ user: { id: "editor", email: "dbqls110@gmail.com", role: "admin", active: true } });
  m.permission.mockResolvedValue(undefined);
  m.entryUpdate.mockResolvedValue({ count: 1 });
  m.update.mockResolvedValue({ count: 1 });
  m.find.mockResolvedValue({ projectId: "project-1", kind: "revenue" });
});
function form(fields: Record<string, string>) { const value = new FormData(); for (const [key, text] of Object.entries(fields)) value.set(key, text); return value; }

describe("매출 날짜 저장", () => {
  it("프로젝트 금액의 날짜만 수정하고 모든 집계 화면을 갱신한다", async () => {
    await updateRevenueDates("project", "amount-1", form({ paidDate: "2026-12-01", expectedPaymentDate: "2026-11-01" }));
    expect(m.permission).toHaveBeenCalledWith("editor", "projects", "admin");
    expect(m.update).toHaveBeenCalledWith({ where: { id: "amount-1", projectId: "project-1", kind: "revenue" }, data: { paidDate: "2026-12-01", invoiceDate: null, expectedPaymentDate: "2026-11-01" } });
    expect(m.revalidate).toHaveBeenCalledWith("/company-finance"); expect(m.revalidate).toHaveBeenCalledWith("/projects/project-1");
  });
  it("직접 장부의 날짜를 수정하면 기존 발생일 fallback을 해제하고 금액은 유지한다", async () => {
    await updateRevenueDates("entry", "entry-1", form({ invoiceDate: "2027-01-02" }));
    expect(m.permission).toHaveBeenCalledWith("editor", "companyFinance", "admin");
    expect(m.entryUpdate).toHaveBeenCalledWith({ where: { id: "entry-1", type: "revenue" }, data: { date: "", paidDate: null, invoiceDate: "2027-01-02", expectedPaymentDate: null } });
  });
  it("세 날짜를 모두 지워 날짜 미정으로 돌릴 수 있다", async () => {
    await updateRevenueDates("entry", "entry-1", form({}));
    expect(m.entryUpdate.mock.calls[0][0].data).toEqual({ date: "", paidDate: null, invoiceDate: null, expectedPaymentDate: null });
  });
  it.each([null, { id: "dot", role: "dot", active: true }, { id: "inactive", role: "admin", active: false }, { id: "external", role: "partner", active: true }])("허용하지 않는 계정은 저장하지 못한다: %j", async user => {
    m.session.mockResolvedValue(user ? { user } : null);
    await expect(updateRevenueDates("project", "amount-1", form({ paidDate: "2026-11-01" }))).rejects.toThrow();
    expect(m.update).not.toHaveBeenCalled(); expect(m.entryUpdate).not.toHaveBeenCalled();
  });
  it("수정 권한이 없거나 날짜가 잘못되면 저장 전에 차단한다", async () => {
    m.permission.mockRejectedValueOnce(Error("forbidden"));
    await expect(updateRevenueDates("entry", "entry-1", form({}))).rejects.toThrow("forbidden");
    await expect(updateRevenueDates("entry", "entry-1", form({ paidDate: "2026-02-30" }))).rejects.toThrow();
    expect(m.entryUpdate).not.toHaveBeenCalled();
  });
  it("매입이나 없는 프로젝트 매출은 변경하지 않는다", async () => {
    m.find.mockResolvedValue({ projectId: "project-1", kind: "cost" });
    await expect(updateRevenueDates("project", "amount-1", form({}))).rejects.toThrow("매출 항목");
    m.entryUpdate.mockResolvedValue({ count: 0 });
    await expect(updateRevenueDates("entry", "missing", form({}))).rejects.toThrow("매출 항목");
    expect(m.update).not.toHaveBeenCalled(); expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("새 매출을 등록할 때 작성일을 기준일로 자동 입력하지 않는다", async () => {
    await addCompanyFinanceEntry(form({ company: "인포피아", type: "revenue", title: "매출", amount: "1000", expectedPaymentDate: "2026-11-20" }));
    expect(m.entryCreate.mock.calls[0][0].data).toMatchObject({ date: "", expectedPaymentDate: "2026-11-20", paidDate: null, invoiceDate: null });
  });

  it.each(["entry", "project"] as const)("다른 관리자가 %s 날짜 액션을 직접 호출해도 조회·저장 전에 차단한다", async source => {
    m.session.mockResolvedValue({ user: { id: "other-admin", email: "other@example.com", role: "admin", active: true } });
    await expect(updateRevenueDates(source, "amount-1", form({ paidDate: "2026-11-03", email: "dbqls110@gmail.com" }))).rejects.toThrow("본인 계정");
    expect(m.find).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.entryUpdate).not.toHaveBeenCalled();
  });

  it.each(["paidDate", "invoiceDate", "expectedPaymentDate"] as const)("프로젝트 일반 저장으로 %s를 변경하거나 지우는 우회를 막는다", async field => {
    m.session.mockResolvedValue({ user: { id: "other", email: "other@example.com", role: "admin", active: true } });
    for (const value of ["2026-11-03", null]) {
      const input = { kind: "revenue" as const, amount: 1000, [field]: value };
      await expect(createProjectAmount("project-1", input)).rejects.toThrow("본인 계정");
      await expect(updateProjectAmount("amount-1", "project-1", input)).rejects.toThrow("본인 계정");
    }
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("직접 매출 등록으로 날짜 입력·빈 값 전송을 우회할 수 없다", async () => {
    m.session.mockResolvedValue({ user: { id: "other", email: "other@example.com", role: "admin", active: true } });
    for (const value of ["2026-11-03", ""]) {
      await expect(addCompanyFinanceEntry(form({ company: "인포피아", type: "revenue", title: "매출", amount: "1000", invoiceDate: value }))).rejects.toThrow("본인 계정");
    }
    expect(m.entryCreate).not.toHaveBeenCalled();
  });

  it("다른 직원의 날짜 없는 신규 매출과 매입 발생일 입력은 유지한다", async () => {
    m.session.mockResolvedValue({ user: { id: "staff", email: "staff@example.com", role: "staff", active: true } });
    await addCompanyFinanceEntry(form({ company: "인포피아", type: "revenue", title: "미정 매출", amount: "1000" }));
    expect(m.entryCreate.mock.calls[0][0].data).toMatchObject({ paidDate: null, invoiceDate: null, expectedPaymentDate: null });
    await addCompanyFinanceEntry(form({ company: "인포피아", type: "cost", title: "매입", amount: "1000", date: "2026-11-03" }));
    expect(m.entryCreate.mock.calls[1][0].data.date).toBe("2026-11-03");
  });

  it("다른 직원이 프로젝트 금액만 수정하면 기존 세 날짜를 건드리지 않는다", async () => {
    m.session.mockResolvedValue({ user: { id: "staff", email: "staff@example.com", role: "staff", active: true } });
    const existing = { id: "amount-1", projectId: "project-1", kind: "revenue", amount: 1000, paidDate: "2026-11-03", invoiceDate: "2026-10-31", expectedPaymentDate: "2026-10-30" };
    const update = vi.fn().mockResolvedValue(existing);
    const tx = { $executeRaw: vi.fn(), projectAmount: { findUnique: vi.fn().mockResolvedValue(existing), update, findMany: vi.fn().mockResolvedValue([{ kind: "revenue", amount: 2000 }]) }, project: { update: vi.fn() } };
    m.transaction.mockImplementation(async callback => callback(tx));
    await updateProjectAmount("amount-1", "project-1", { kind: "revenue", amount: 2000 });
    const data = update.mock.calls[0][0].data;
    expect(data.amount).toBe(2000);
    for (const field of ["paidDate", "invoiceDate", "expectedPaymentDate"]) expect(data).not.toHaveProperty(field);
  });
});
