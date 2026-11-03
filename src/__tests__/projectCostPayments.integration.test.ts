import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const m = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.access, requireMenuEdit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { saveProjectCostPayment, deleteProjectCostPayment, setProjectCostSettled } from "@/app/actions/projectCostPayment";
import { deleteProjectAmount, updateProjectAmount } from "@/app/actions/projectAmount";
import { deleteQuoteAmounts, upsertQuoteAmounts } from "@/lib/projectAmounts";
import { costPaymentMetrics } from "@/lib/projectCostPayments";
import { EXTERNAL_PROJECT_SELECT, projectWhereForViewer } from "@/lib/projectVisibility";

const enabled = process.env.ERP_COST_DB_TEST === "1";
const staff = { id: "fixture-staff", role: "member", active: true, partnerId: null, customerId: null, venueId: null };
const projectId = `cost-db-test-${randomUUID()}`;
const otherProjectId = `cost-db-other-${randomUUID()}`;
const costId = `${projectId}-cost`;
const revenueId = `${projectId}-revenue`;
const partnerId = `${projectId}-partner`;
let fixtureReady = false;
const payment = (id: string, amount = 10_000) => ({ id, amount, paidDate: "2026-11-03", memo: "isolated fixture", settle: false });

describe.skipIf(!enabled)("실제 PostgreSQL 지급 저장 및 동시성", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") throw Error("Isolated fixture database required");
    fixtureReady = true;
    await prisma.project.create({ data: { id: projectId, name: "isolated payment fixture", amounts: { create: [
      { id: costId, kind: "cost", amount: 330_000, label: "견적서", sourceFileName: "fixture.xlsx" },
      { id: revenueId, kind: "revenue", amount: 1_000_000 },
    ] } } });
    await prisma.project.create({ data: { id: otherProjectId, name: "other isolated fixture" } });
    await prisma.partner.create({ data: { id: partnerId, name: "isolated partner" } });
    await prisma.projectPartner.create({ data: { projectId, partnerId } });
  });
  beforeEach(async () => {
    m.session.mockResolvedValue({ user: staff }); m.access.mockResolvedValue(true);
    await prisma.projectCostPayment.deleteMany({ where: { projectAmountId: costId } });
    await prisma.projectAmount.update({ where: { id: costId }, data: { amount: 330_000, kind: "cost", costSettled: false } });
  });
  afterAll(async () => {
    if (fixtureReady) {
      await prisma.projectCostPayment.deleteMany({ where: { projectAmountId: costId } });
      await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
      await prisma.partner.deleteMany({ where: { id: partnerId } });
      await prisma.$disconnect();
    }
  });

  it("실제 부분 지급·수정·정산을 저장하고 독립 DB 연결에서도 읽힌다", async () => {
    await saveProjectCostPayment(projectId, costId, payment("persist-first", 100_000));
    await saveProjectCostPayment(projectId, costId, { ...payment("persist-second", 200_000), settle: true });
    const reader = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    try {
      const row = await reader.projectAmount.findUniqueOrThrow({ where: { id: costId }, include: { payments: true } });
      expect(row.amount).toBe(330_000);
      expect(costPaymentMetrics(row)).toMatchObject({ paid: 300_000, remaining: 0, status: "정산 완료" });
      expect(row.payments).toHaveLength(2); expect(row.payments.every(p => p.paidDate === "2026-11-03")).toBe(true);
      expect(row.payments.every(p => p.createdById === staff.id && p.updatedById === staff.id)).toBe(true);
    } finally { await reader.$disconnect(); }
    await saveProjectCostPayment(projectId, costId, { ...payment("persist-second", 220_000), settle: true });
    expect((await prisma.projectCostPayment.aggregate({ where: { projectAmountId: costId }, _sum: { amount: true } }))._sum.amount).toBe(320_000);
    await deleteProjectCostPayment(projectId, costId, "persist-second");
    expect((await prisma.projectAmount.findUniqueOrThrow({ where: { id: costId } })).costSettled).toBe(false);
  });

  it("동일 지급 ID 12개 동시 재전송은 1건만 저장한다", async () => {
    await Promise.all(Array.from({ length: 12 }, () => saveProjectCostPayment(projectId, costId, payment("duplicate-request"))));
    expect(await prisma.projectCostPayment.count({ where: { projectAmountId: costId } })).toBe(1);
    expect((await prisma.projectCostPayment.aggregate({ where: { projectAmountId: costId }, _sum: { amount: true } }))._sum.amount).toBe(10_000);
  });

  it("서로 다른 지급 12개 동시 저장은 누락 없이 합산한다", async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => saveProjectCostPayment(projectId, costId, payment(`parallel-${i}`, (i + 1) * 1000))));
    expect(await prisma.projectCostPayment.count({ where: { projectAmountId: costId } })).toBe(12);
    expect((await prisma.projectCostPayment.aggregate({ where: { projectAmountId: costId }, _sum: { amount: true } }))._sum.amount).toBe(78_000);
  });

  it("실제 잠금을 잡은 동안 저장이 대기하며 해제 뒤 정상 저장한다", async () => {
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    let release = () => {};
    let acquired = () => {};
    const acquiredPromise = new Promise<void>(resolve => { acquired = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const holder = client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
      acquired(); await releasePromise;
    });
    await acquiredPromise;
    const saving = saveProjectCostPayment(projectId, costId, payment("blocked-save"));
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(await prisma.projectCostPayment.count({ where: { id: "blocked-save" } })).toBe(0);
      release(); await holder; await saving;
      expect(await prisma.projectCostPayment.count({ where: { id: "blocked-save" } })).toBe(1);
    } finally { release(); await client.$disconnect(); }
  });

  it("지급 저장과 매출 전환 경쟁에서 지급을 가진 매출이 생기지 않는다", async () => {
    const results = await Promise.allSettled([
      saveProjectCostPayment(projectId, costId, payment("race-kind")),
      updateProjectAmount(costId, projectId, { kind: "revenue", amount: 330_000 }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.projectAmount.findUniqueOrThrow({ where: { id: costId }, include: { payments: true } });
    expect(row.kind === "cost" || row.payments.length === 0).toBe(true);
  });

  it("지급 저장과 매입 삭제 경쟁에서 지급 기록을 잃지 않는다", async () => {
    const secondId = `${projectId}-race-delete`;
    await prisma.projectAmount.create({ data: { id: secondId, projectId, kind: "cost", amount: 20_000 } });
    const results = await Promise.allSettled([
      saveProjectCostPayment(projectId, secondId, payment("race-delete")),
      deleteProjectAmount(secondId, projectId),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.projectAmount.findUnique({ where: { id: secondId }, include: { payments: true } });
    if (row) { expect(row.payments).toHaveLength(1); await prisma.projectCostPayment.deleteMany({ where: { projectAmountId: secondId } }); await prisma.projectAmount.delete({ where: { id: secondId } }); }
    else expect(await prisma.projectCostPayment.count({ where: { id: "race-delete" } })).toBe(0);
  });

  it("견적서 삭제·재분석에도 지급 기록은 보존하며 FK가 직접 삭제를 거부한다", async () => {
    await saveProjectCostPayment(projectId, costId, payment("quote-preserved"));
    await deleteQuoteAmounts(projectId, "fixture.xlsx");
    await upsertQuoteAmounts(projectId, "fixture.xlsx", { revenue: null, cost: null });
    expect(await prisma.projectCostPayment.count({ where: { id: "quote-preserved" } })).toBe(1);
    await expect(prisma.projectAmount.delete({ where: { id: costId } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("외부 계정·다른 프로젝트·매출·잘못된 날짜는 실제 DB를 바꾸지 않는다", async () => {
    m.session.mockResolvedValue({ user: { ...staff, role: "partner", partnerId: "external-1" } });
    await expect(saveProjectCostPayment(projectId, costId, payment("reject-external"))).rejects.toThrow();
    m.session.mockResolvedValue({ user: staff });
    await expect(saveProjectCostPayment(otherProjectId, costId, payment("reject-project"))).rejects.toThrow();
    await expect(saveProjectCostPayment(projectId, revenueId, payment("reject-revenue"))).rejects.toThrow();
    await expect(saveProjectCostPayment(projectId, costId, { ...payment("reject-date"), paidDate: "2026-02-30" })).rejects.toThrow();
    expect(await prisma.projectCostPayment.count({ where: { projectAmountId: costId } })).toBe(0);
    await expect(setProjectCostSettled(projectId, costId, true)).rejects.toThrow();
  });

  it("외부 상세 조회 조건은 실제 DB에서도 연결된 프로젝트의 최소 필드만 반환한다", async () => {
    const viewer = { ...staff, role: "partner", partnerId };
    const summary = await prisma.project.findUnique({ where: { id: projectId, AND: [projectWhereForViewer(viewer)] }, select: EXTERNAL_PROJECT_SELECT });
    expect(summary).not.toBeNull();
    expect(Object.keys(summary ?? {}).sort()).toEqual(Object.keys(EXTERNAL_PROJECT_SELECT).sort());
    expect(summary).not.toHaveProperty("amounts"); expect(summary).not.toHaveProperty("revenue"); expect(summary).not.toHaveProperty("cost");
    expect(await prisma.project.findUnique({ where: { id: otherProjectId, AND: [projectWhereForViewer(viewer)] }, select: EXTERNAL_PROJECT_SELECT })).toBeNull();
  });

  it("지급 테이블은 RLS가 켜져 있으며 ERP 서버 소유자 이외의 직접 조회를 차단한다", async () => {
    await saveProjectCostPayment(projectId, costId, payment("rls-private-payment"));
    const tables = await prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.project_cost_payments'::regclass`;
    expect(tables[0].relrowsecurity).toBe(true);
    await prisma.$executeRaw`CREATE ROLE erp_cost_outsider_test NOLOGIN`;
    try {
      await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO erp_cost_outsider_test`;
      await prisma.$executeRaw`GRANT SELECT ON project_cost_payments TO erp_cost_outsider_test`;
      const rows = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL ROLE erp_cost_outsider_test`;
        return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM project_cost_payments`;
      });
      expect(rows).toEqual([]);
      expect(await prisma.projectCostPayment.count({ where: { id: "rls-private-payment" } })).toBe(1);
    } finally {
      await prisma.$executeRaw`REVOKE SELECT ON project_cost_payments FROM erp_cost_outsider_test`;
      await prisma.$executeRaw`REVOKE USAGE ON SCHEMA public FROM erp_cost_outsider_test`;
      await prisma.$executeRaw`DROP ROLE erp_cost_outsider_test`;
    }
  });
});
