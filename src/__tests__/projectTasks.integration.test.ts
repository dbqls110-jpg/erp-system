import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), revalidate: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.access, requireMenuEdit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { prisma } from "@/lib/prisma";
import { createProjectTask, editProjectTask, completeProjectTask, removeProjectTask, listTaskCalendarEvents, projectTaskDto, PROJECT_TASK_SELECT, setProjectCompleted } from "@/lib/projectTasks";
import { saveProjectTaskAction } from "@/app/actions/projectTask";
import { nextProjectTask, todayProjectTasks, type TaskDraft } from "@/lib/projectTaskPolicy";
import { saveProjectWorkspace, reminderId } from "@/lib/projectWorkspace";

const enabled = process.env.ERP_TASK_DB_TEST === "1";
const prefix = `task-test-${randomUUID()}`;
const projectId = `${prefix}-project`, ownerId = `${prefix}-staff`;
const viewer = { id: ownerId, role: "member", active: true, partnerId: null, customerId: null, venueId: null };
const draft: TaskDraft = { projectId, content: "시안 회신 확인", assigneeId: ownerId, taskStatus: "waiting", nextCheckDate: "2026-11-17", dueDate: "2026-11-20", waitingOn: "고객" };
let ready = false;
function assertFixture() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") throw Error("Isolated fixture database required");
}
describe.skipIf(!enabled)("할 일 실제 PostgreSQL 저장 · 한 원본 · 동시성", () => {
  beforeAll(async () => {
    assertFixture(); m.session.mockResolvedValue({ user: viewer }); m.access.mockResolvedValue(true);
    await prisma.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid`, name: "격리 테스트 직원", role: "member" } });
    await prisma.project.create({ data: { id: projectId, name: "격리 업무 검증", revenue: 1_000_000, cost: 300_000, memo: "보존할 메모", amounts: { create: [{ kind: "revenue", amount: 1_000_000 }, { kind: "cost", amount: 300_000 }] } } });
    ready = true;
  });
  afterAll(async () => {
    if (ready) {
      await prisma.project.deleteMany({ where: { id: projectId } });
      await prisma.user.deleteMany({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });
  it("마이그레이션은 기존 ID·완료 기록을 유지하고 날짜를 채우지 않는다", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
    try {
      await client.query("BEGIN");
      await client.query('CREATE SCHEMA task_workspace_migration_fixture; SET LOCAL search_path=task_workspace_migration_fixture; CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE checklist_items(id TEXT PRIMARY KEY, "projectId" TEXT, content TEXT, "isDone" BOOLEAN, "completedAt" TIMESTAMP(3), "order" INTEGER, "createdAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3)); INSERT INTO checklist_items(id, content, "isDone", "completedAt") VALUES (\'old-task\', \'기존 완료 업무\', true, \'2026-11-01 01:00:00\')');
      await client.query(await readFile(new URL("../../prisma/migrations/20261117090000_project_task_workspace/migration.sql", import.meta.url), "utf8"));
      const { rows } = await client.query('SELECT id, content, "isDone", "completedAt", "assigneeId", "nextCheckDate", "dueDate", version FROM checklist_items');
      expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ id: "old-task", content: "기존 완료 업무", isDone: true, assigneeId: null, nextCheckDate: null, dueDate: null, version: 0 });
      expect(rows[0].completedAt).not.toBeNull();
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
  it("한 번 저장한 ID가 상세·오늘·캘린더에 동일하게 반영된다", async () => {
    const id = `${prefix}-one`;
    const result = await saveProjectTaskAction(draft, { kind: "create", requestId: id }); expect(result.ok).toBe(true);
    const stored = projectTaskDto(await prisma.checklistItem.findUniqueOrThrow({ where: { id }, select: PROJECT_TASK_SELECT }));
    expect(nextProjectTask([stored])?.id).toBe(id);
    expect(todayProjectTasks([stored], "2026-11-17", ownerId)[0].id).toBe(id);
    const events = await listTaskCalendarEvents(viewer, "2026-11-01", "2026-11-30");
    expect(events.filter(e => e.taskId === id)).toHaveLength(2);
    expect(m.revalidate.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(["/projects", `/projects/${projectId}`, "/calendar"]));
    const edited = await editProjectTask(id, { ...draft, nextCheckDate: "2026-12-01", dueDate: null }, stored.version);
    expect(todayProjectTasks([edited], "2026-11-17", ownerId)).toEqual([]);
    expect((await listTaskCalendarEvents(viewer, "2026-11-01", "2026-11-30")).some(e => e.taskId === id)).toBe(false);
    expect((await listTaskCalendarEvents(viewer, "2026-12-01", "2026-12-31")).some(e => e.taskId === id)).toBe(true);
  });
  it("공연 일정·과업은 한 리마인드와 날짜 미정 할 일을 저장하고 재시도로 복제하지 않는다", async () => {
    const id = `${prefix}-reminder`;
    await prisma.project.create({ data: { id, name: "리마인드 격리 검증" } });
    try {
      await saveProjectWorkspace(id, { workScope: "무대 운영", eventType: "performance", eventDate: "2027-04-21", initialTasks: "장비 확인" }, 0);
      const tasks = await prisma.checklistItem.findMany({ where: { projectId: id }, select: PROJECT_TASK_SELECT });
      expect(tasks).toHaveLength(2);
      expect(tasks.find(task => task.id === reminderId(id))).toMatchObject({ nextCheckDate: "2027-03-21", dueDate: "2027-04-21", assigneeId: ownerId });
      expect(tasks.find(task => task.content === "장비 확인")).toMatchObject({ nextCheckDate: null, dueDate: null });
      await expect(saveProjectWorkspace(id, { initialTasks: "장비 확인" }, 0)).rejects.toThrow("다른 화면");
      const reminder = tasks.find(task => task.id === reminderId(id))!;
      await expect(editProjectTask(reminder.id, { ...draft, projectId: id, dueDate: "2027-05-01" }, reminder.version)).rejects.toThrow("실제 일정");
      await expect(removeProjectTask(reminder.id, id, reminder.version)).rejects.toThrow("실제 일정");
      await completeProjectTask(reminder.id, id, true, reminder.version);
      await saveProjectWorkspace(id, { workScope: "무대 운영 보완", eventType: "performance", eventDate: "2027-04-21" }, 1);
      expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: reminder.id } })).isDone).toBe(true);
      await saveProjectWorkspace(id, { workScope: "무대 운영", eventType: "performance", eventDate: "2027-04-22" }, 2);
      expect(await prisma.checklistItem.findUniqueOrThrow({ where: { id: reminder.id } })).toMatchObject({ isDone: false, nextCheckDate: "2027-03-22" });
      expect(await prisma.checklistItem.count({ where: { projectId: id } })).toBe(2);
      const events = await listTaskCalendarEvents(viewer, "2027-03-01", "2027-04-30");
      expect(events.filter(event => event.taskId === reminder.id)).toHaveLength(2);
      const races = await Promise.allSettled([saveProjectWorkspace(id, { workScope: "A", eventType: "performance", eventDate: "2027-04-22" }, 3), saveProjectWorkspace(id, { workScope: "B", eventType: "performance", eventDate: "2027-04-22" }, 3)]);
      expect(races.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const currentReminder = await prisma.checklistItem.findUniqueOrThrow({ where: { id: reminder.id } });
      await completeProjectTask(reminder.id, id, true, currentReminder.version);
      await saveProjectWorkspace(id, { workScope: "공연 취소", eventType: "general", eventDate: null }, 4);
      expect(await prisma.checklistItem.findUniqueOrThrow({ where: { id: reminder.id } })).toMatchObject({ isDone: true, dueDate: null });
    } finally { await prisma.project.delete({ where: { id } }); }
  });
  it("할 일 추가 후 진행률을 다시 계산하고 금액·파일을 건드리지 않는다", async () => {
    const id = `${prefix}-scope-progress`;
    await prisma.project.create({ data: { id, name: "과업 진행률 격리", revenue: 1000, checklistItems: { create: { content: "완료 업무", isDone: true } } } });
    try {
      await saveProjectWorkspace(id, { workScope: "추가 과업", initialTasks: "새 업무" }, 0);
      expect(await prisma.project.findUniqueOrThrow({ where: { id } })).toMatchObject({ revenue: 1000, progress: 50, eventDate: null });
    } finally { await prisma.project.delete({ where: { id } }); }
  });
  it("등록 요청 8개 재전송은 한 행만 저장한다", async () => {
    const id = `${prefix}-duplicate`;
    const results = await Promise.all(Array.from({ length: 8 }, () => createProjectTask(draft, id)));
    expect(new Set(results.map(row => row.id)).size).toBe(1);
    expect(await prisma.checklistItem.count({ where: { id } })).toBe(1);
  });
  it("서로 다른 업무 8개 동시 등록도 누락과 정렬 충돌이 없다", async () => {
    const rows = await Promise.all(Array.from({ length: 8 }, (_, i) => createProjectTask({ ...draft, content: `병렬 업무 ${i}` }, `${prefix}-parallel-${i}`)));
    expect(new Set(rows.map(row => row.order)).size).toBe(8);
    expect(await prisma.checklistItem.count({ where: { id: { in: rows.map(row => row.id) } } })).toBe(8);
  });
  it("같은 버전의 동시 수정은 하나만 성공하고 다른 변경을 덮어쓰지 않는다", async () => {
    const created = await createProjectTask(draft, `${prefix}-edit`);
    const results = await Promise.allSettled([editProjectTask(created.id, { ...draft, content: "수정 A" }, 0), editProjectTask(created.id, { ...draft, content: "수정 B" }, 0)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: created.id } })).version).toBe(1);
  });
  it("완료·취소·삭제 후에도 프로젝트 상태·금액·메모가 유지된다", async () => {
    const row = await createProjectTask(draft, `${prefix}-done`);
    const done = await completeProjectTask(row.id, projectId, true, row.version);
    expect(done.completedAt).not.toBeNull(); expect(todayProjectTasks([done], "2026-11-17", null)).toEqual([]);
    const undone = await completeProjectTask(row.id, projectId, false, done.version);
    expect(undone.completedAt).toBeNull();
    await removeProjectTask(row.id, projectId, undone.version);
    expect((await listTaskCalendarEvents(viewer, "2026-11-01", "2026-11-30")).some(e => e.taskId === row.id)).toBe(false);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { amounts: true } });
    expect(project).toMatchObject({ status: "active", revenue: 1_000_000, cost: 300_000, memo: "보존할 메모" });
    expect(project.amounts).toHaveLength(2);
  });
  it("파트너·거래처는 내부 업무 수정과 캘린더 조회를 못 한다", async () => {
    const outsider = { ...viewer, role: "admin", partnerId: "external-party" };
    m.session.mockResolvedValue({ user: outsider });
    await expect(createProjectTask(draft, `${prefix}-forbidden`)).rejects.toThrow("외부 계정");
    await expect(setProjectCompleted(projectId, true, "active")).rejects.toThrow("외부 계정");
    expect(await listTaskCalendarEvents(outsider, "2026-11-01", "2026-11-30")).toEqual([]);
    expect(await prisma.checklistItem.count({ where: { id: `${prefix}-forbidden` } })).toBe(0);
    m.session.mockResolvedValue({ user: viewer });
  });
  it("프로젝트 전체 완료 8회 재전송과 취소는 금액·파일·업무 체크를 변경하지 않는다", async () => {
    const read = () => prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { revenue: true, cost: true, memo: true, amounts: { select: { id: true, amount: true, kind: true } }, files: { select: { id: true } }, checklistItems: { select: { id: true, content: true, isDone: true, completedAt: true, version: true }, orderBy: { id: "asc" } } } });
    const before = await read();
    const results = await Promise.all(Array.from({ length: 8 }, () => setProjectCompleted(projectId, true, "active")));
    expect(results.every(result => result.status === "completed" && result.progress === 100)).toBe(true);
    expect(await read()).toEqual(before);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true, progress: true } })).toEqual({ status: "completed", progress: 100 });
    await setProjectCompleted(projectId, false, "completed");
    expect(await read()).toEqual(before);
  });
  it("체크리스트 없는 프로젝트도 완료 100% 및 취소 0%를 실제 저장한다", async () => {
    const id = `${prefix}-empty-project`;
    await prisma.project.create({ data: { id, name: "할 일 없는 격리 프로젝트" } });
    try {
      await setProjectCompleted(id, true, "active");
      expect(await prisma.project.findUniqueOrThrow({ where: { id }, select: { status: true, progress: true } })).toEqual({ status: "completed", progress: 100 });
      await setProjectCompleted(id, false, "completed");
      expect(await prisma.project.findUniqueOrThrow({ where: { id }, select: { status: true, progress: true } })).toEqual({ status: "active", progress: 0 });
    } finally { await prisma.project.delete({ where: { id } }); }
  });
});
