import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), session: vi.fn(), lock: vi.fn(),
  find: vi.fn(), findOrThrow: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), count: vi.fn(), aggregate: vi.fn(), user: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/actionGuards", () => ({ requireEditAccess: m.auth, requireSessionUser: m.session }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.access }));
vi.mock("@/lib/prisma", () => {
  const tx = { $queryRaw: m.lock, user: { findFirst: m.user }, project: { update: m.project }, checklistItem: {
    findUnique: m.find, findUniqueOrThrow: m.findOrThrow, findMany: m.list, create: m.create, updateMany: m.update, deleteMany: m.remove, count: m.count, aggregate: m.aggregate,
  } };
  return { prisma: { ...tx, $transaction: (run: (db: typeof tx) => unknown) => run(tx) } };
});
import { createProjectTask, editProjectTask, completeProjectTask, removeProjectTask, listTaskCalendarEvents, setProjectCompleted } from "@/lib/projectTasks";

const draft = { projectId: "p1", content: "시안 확인", assigneeId: "u1", taskStatus: "todo" as const, nextCheckDate: "2026-11-17", dueDate: null, waitingOn: null };
const row = { ...draft, id: "t1", isDone: false, completedAt: null, order: 0, version: 2, assignee: { name: "직원" } };
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue({ user: { id: "u1" } }); m.access.mockResolvedValue(true); m.lock.mockResolvedValue([{ id: "p1" }]);
  m.find.mockResolvedValue(row); m.findOrThrow.mockResolvedValue(row); m.user.mockResolvedValue({ id: "u1" }); m.count.mockResolvedValue(1);
  m.update.mockResolvedValue({ count: 1 }); m.remove.mockResolvedValue({ count: 1 }); m.aggregate.mockResolvedValue({ _max: { order: 0 } });
});
describe("프로젝트 업무 저장 경계와 동시 수정", () => {
  it("프로젝트 전체 완료는 할 일이 없어도 완료 100%로 바꾸며 금액·업무는 그대로 둔다", async () => {
    m.lock.mockResolvedValue([{ id: "p1", status: "active" }]);
    expect(await setProjectCompleted("p1", true, "active")).toEqual({ projectId: "p1", status: "completed", progress: 100 });
    expect(m.project).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "completed", progress: 100 } });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("전체 완료 취소는 기존 업무 완료 비율을 복구하고 오래된 다른 상태는 덮지 않는다", async () => {
    m.lock.mockResolvedValue([{ id: "p1", status: "completed" }]);
    m.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    expect(await setProjectCompleted("p1", false, "completed")).toMatchObject({ status: "active", progress: 25 });
    m.project.mockClear(); m.lock.mockResolvedValue([{ id: "p1", status: "on_hold" }]);
    await expect(setProjectCompleted("p1", true, "active")).rejects.toThrow("다른 화면");
    expect(m.project).not.toHaveBeenCalled();
  });
  it("권한 없는 전체 완료 요청은 DB 조회 전에 막는다", async () => {
    m.auth.mockRejectedValue(Error("Forbidden"));
    await expect(setProjectCompleted("p1", true, "active")).rejects.toThrow("Forbidden");
    expect(m.lock).not.toHaveBeenCalled();
  });
  it("쓰기 권한이 없으면 업무 DB를 읽거나 잠그지 않는다", async () => {
    m.auth.mockRejectedValue(Error("Forbidden"));
    await expect(editProjectTask("t1", draft, 2)).rejects.toThrow("Forbidden");
    expect(m.lock).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it("프로젝트 ID와 버전이 일치할 때만 수정하며 금액은 건드리지 않는다", async () => {
    await editProjectTask("t1", draft, 2);
    expect(m.update.mock.calls[0][0]).toMatchObject({ where: { id: "t1", projectId: "p1", version: 2 }, data: { version: { increment: 1 } } });
    expect(m.project).not.toHaveBeenCalled();
  });
  it("오래된 화면의 수정과 다른 프로젝트의 삭제는 덮어쓰지 않는다", async () => {
    m.update.mockResolvedValue({ count: 0 }); m.remove.mockResolvedValue({ count: 0 });
    await expect(editProjectTask("t1", draft, 1)).rejects.toThrow("다른 화면");
    await expect(removeProjectTask("t1", "other", 2)).rejects.toThrow("다른 화면");
    expect(m.remove).toHaveBeenCalledWith({ where: { id: "t1", projectId: "other", version: 2 } });
    expect(m.project).not.toHaveBeenCalled();
  });
  it("외부·비활성 담당자를 지정할 수 없다", async () => {
    m.user.mockResolvedValue(null);
    await expect(editProjectTask("t1", draft, 2)).rejects.toThrow("내부 직원");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("같은 등록 요청을 다시 보내도 기존 ID를 반환한다", async () => {
    expect(await createProjectTask(draft, "t1")).toMatchObject({ id: "t1", assigneeName: "직원" });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("완료 재전송은 완료 시각을 다시 쓰지 않는다", async () => {
    m.find.mockResolvedValue({ ...row, isDone: true, completedAt: new Date("2026-11-17T00:00:00Z") });
    expect(await completeProjectTask("t1", "p1", true, 2)).toMatchObject({ completedAt: "2026-11-17T00:00:00.000Z" });
    expect(m.update).not.toHaveBeenCalled(); expect(m.project).not.toHaveBeenCalled();
  });
  it("업무 완료는 진행률만 갱신하고 프로젝트 상태·금액을 바꾸지 않는다", async () => {
    await completeProjectTask("t1", "p1", true, 2);
    expect(m.project).toHaveBeenCalledWith({ where: { id: "p1" }, data: { progress: 100 } });
    expect(m.update.mock.calls[0][0].data).toMatchObject({ isDone: true, version: { increment: 1 } });
  });
  it.each([
    { id: "external", role: "partner", partnerId: "partner", customerId: null },
    { id: "misconfigured", role: "admin", partnerId: null, customerId: "client" },
  ])("외부 캘린더는 내부 업무를 조회조차 하지 않는다", async viewer => {
    expect(await listTaskCalendarEvents(viewer, "2026-11-01", "2026-11-30")).toEqual([]);
    expect(m.list).not.toHaveBeenCalled(); expect(m.access).not.toHaveBeenCalled();
  });
});
