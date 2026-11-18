import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), edit: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: mocks.access, canEditMenu: mocks.edit, requireMenuEdit: async () => { if (!await mocks.edit()) throw Error("Forbidden"); } }));
import { prisma } from "@/lib/prisma";
import { getProjectContact, getProjectContacts, recordProjectContact } from "@/lib/projectContacts";

const enabled = process.env.ERP_CONTACT_DB_TEST === "1";
const prefix = `contact-${randomUUID()}`, projectId = `${prefix}-project`, userId = `${prefix}-user`;
const otherUserId = `${prefix}-staff`;
const user = { id: userId, email: "dbqls110@gmail.com", name: "검증 담당자", role: "admin", active: true, partnerId: null, customerId: null, venueId: null };
const draft = { projectId, requestId: `${prefix}-request`, version: 0, status: "quote_sent", note: "검토 요청", nextContactAt: "" };
let ready = false;
describe.skipIf(!enabled)("프로젝트 연락 상태 실제 DB · 권한 · 동시성", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") throw Error("Isolated DB required");
    mocks.session.mockResolvedValue({ user }); mocks.access.mockResolvedValue(true); mocks.edit.mockResolvedValue(true);
    await prisma.user.create({ data: { id: userId, email: `${prefix}@example.invalid`, name: user.name, role: "admin" } });
    await prisma.user.create({ data: { id: otherUserId, email: `${prefix}-staff@example.invalid`, name: "다른 직원", role: "member" } });
    await prisma.project.create({ data: { id: projectId, name: "연락 상태 검증", status: "active", progress: 35, revenue: 1000000, cost: 300000, memo: "보존" } });
    await prisma.projectFile.create({ data: { projectId, driveFileId: "fixture-unused", name: "보존할 견적서.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", driveUrl: "https://example.invalid/fixture-quote" } });
    ready = true;
  });
  afterAll(async () => { if (ready) { await prisma.project.deleteMany({ where: { id: projectId } }); await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } }); } await prisma.$disconnect(); });
  it("견적 발송을 기록해도 프로젝트 완료율·금액·파일을 변경하지 않는다", async () => {
    const saved = await recordProjectContact(draft);
    expect(saved).toMatchObject({ contactStatus: "quote_sent", note: "검토 요청", nextContactAt: null, version: 1 });
    expect(saved.history).toHaveLength(1);
    expect(await prisma.project.findUnique({ where: { id: projectId } })).toMatchObject({ status: "active", progress: 35, revenue: 1000000, cost: 300000, memo: "보존", deadline: null });
    expect((await prisma.projectFile.findMany({ where: { projectId } })).map(file => file.name)).toEqual(["보존할 견적서.xlsx"]);
    expect(await getProjectContact(projectId)).toEqual(saved);
  });
  it("동일 요청 8회 재전송은 기록을 복제하지 않는다", async () => {
    await Promise.all(Array.from({ length: 8 }, () => recordProjectContact(draft)));
    expect(await prisma.projectContactLog.count({ where: { projectId } })).toBe(1);
    expect((await prisma.projectContactState.findUniqueOrThrow({ where: { projectId } })).version).toBe(1);
  });
  it("같은 버전 동시 수정은 하나만 성공하고 이력과 다음 연락 일정을 함께 저장한다", async () => {
    const results = await Promise.allSettled([
      recordProjectContact({ ...draft, requestId: `${prefix}-edit-a`, version: 1, status: "called", nextContactAt: "2026-11-25T10:00" }),
      recordProjectContact({ ...draft, requestId: `${prefix}-edit-b`, version: 1, status: "waiting", nextContactAt: "2026-11-25T10:00" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const listed = await getProjectContacts();
    expect(listed.items.find(row => row.id === projectId)).toMatchObject({ version: 2, nextContactAt: "2026-11-25T01:00:00.000Z" });
    expect(await prisma.projectContactLog.count({ where: { projectId } })).toBe(2);
  });
  it("프로젝트 권한이 있는 일반 내부 직원도 같은 연락 상태를 조회·수정한다", async () => {
    mocks.session.mockResolvedValue({ user: { ...user, id: otherUserId, role: "member", email: "staff@example.invalid", name: "다른 직원" } });
    expect((await getProjectContacts()).items.find(row => row.id === projectId)?.version).toBe(2);
    const saved = await recordProjectContact({ ...draft, requestId: `${prefix}-staff-edit`, version: 2, status: "waiting" });
    expect(saved).toMatchObject({ contactStatus: "waiting", version: 3, nextContactAt: null });
    expect(saved.history[0].recordedBy).toBe("다른 직원");
    mocks.session.mockResolvedValue({ user });
  });
  it("읽기 전용 프로젝트 권한은 연락 수정까지 허용하지 않는다", async () => {
    mocks.edit.mockResolvedValue(false);
    expect((await getProjectContacts()).canEdit).toBe(false);
    await expect(recordProjectContact({ ...draft, requestId: `${prefix}-read-only`, version: 3 })).rejects.toThrow();
    mocks.edit.mockResolvedValue(true);
  });
  it("예전 관리자 세션이 남아 있어도 DB에서 외부 계정으로 바뀌면 즉시 거부한다", async () => {
    await prisma.user.update({ where: { id: userId }, data: { role: "partner" } });
    try {
      await expect(getProjectContacts()).rejects.toThrow("Forbidden");
      await expect(recordProjectContact({ ...draft, requestId: `${prefix}-stale-role`, version: 3 })).rejects.toThrow("Forbidden");
    } finally { await prisma.user.update({ where: { id: userId }, data: { role: "admin" } }); }
  });
  it("외부 계정·비활성 직원·승인 대기·DOT은 서버에서 조회·수정이 차단된다", async () => {
    for (const denied of [{ ...user, partnerId: "external" }, { ...user, active: false }, { ...user, role: "pending" }, { ...user, role: "dot" }]) {
      mocks.session.mockResolvedValue({ user: denied });
      await expect(getProjectContacts()).rejects.toThrow();
      await expect(recordProjectContact({ ...draft, requestId: `${prefix}-denied`, version: 3 })).rejects.toThrow();
    }
    mocks.session.mockResolvedValue({ user });
    expect(await prisma.projectContactLog.count({ where: { projectId } })).toBe(3);
  });
});
