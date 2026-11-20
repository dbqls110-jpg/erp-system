import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireEditAccess } from "@/lib/actionGuards";
import { canAccessMenu } from "@/lib/permissions";
import { isExternal, type Viewer } from "@/lib/calendarVisibility";
import { TaskConflictError, TaskInputError, parseTaskId, parseTaskVersion, projectTaskCalendarEvents, type ProjectTask, type TaskDraft } from "@/lib/projectTaskPolicy";

export const PROJECT_TASK_SELECT = {
  id: true, projectId: true, content: true, isDone: true, completedAt: true, order: true,
  assigneeId: true, taskStatus: true, nextCheckDate: true, dueDate: true, waitingOn: true, version: true,
  assignee: { select: { name: true } },
} satisfies Prisma.ChecklistItemSelect;
type TaskRow = Prisma.ChecklistItemGetPayload<{ select: typeof PROJECT_TASK_SELECT }>;
export function projectTaskDto(row: TaskRow): ProjectTask {
  const { assignee, completedAt, ...rest } = row;
  return { ...rest, completedAt: completedAt?.toISOString() ?? null, assigneeName: assignee?.name ?? null };
}
export const INTERNAL_TASK_ASSIGNEE_WHERE = {
  active: true, isAgent: false, partnerId: null, customerId: null, venueId: null,
  role: { notIn: ["pending", "partner", "host", "dot"] },
} satisfies Prisma.UserWhereInput;

export async function listTaskPeople() {
  return prisma.user.findMany({ where: INTERNAL_TASK_ASSIGNEE_WHERE, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
}

export async function listTaskCalendarEvents(viewer: Viewer, start: string, end: string) {
  if (isExternal(viewer) || !await canAccessMenu(viewer.id, "projects")) return [];
  const tasks = await prisma.checklistItem.findMany({ where: { OR: [
    { nextCheckDate: { gte: start, lte: end } }, { dueDate: { gte: start, lte: end } },
  ] }, select: { ...PROJECT_TASK_SELECT, project: { select: { name: true } } } });
  return projectTaskCalendarEvents(tasks.map(task => ({ ...projectTaskDto(task), projectName: task.project.name })), start, end);
}

async function lockProject(tx: Prisma.TransactionClient, projectId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: string }[]>`SELECT "id", "status" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`;
  if (!rows.length) throw new TaskInputError("프로젝트를 찾을 수 없습니다.");
  return rows[0];
}
async function checkAssignee(tx: Prisma.TransactionClient, assigneeId: string | null) {
  if (assigneeId && !await tx.user.findFirst({ where: { ...INTERNAL_TASK_ASSIGNEE_WHERE, id: assigneeId }, select: { id: true } })) {
    throw new TaskInputError("활성 상태인 내부 직원을 담당자로 선택해 주세요.");
  }
}
async function syncTaskProgress(tx: Prisma.TransactionClient, projectId: string) {
  const [total, done] = await Promise.all([
    tx.checklistItem.count({ where: { projectId } }), tx.checklistItem.count({ where: { projectId, isDone: true } }),
  ]);
  await tx.project.update({ where: { id: projectId }, data: { progress: total ? Math.round(done / total * 100) : 0 } });
}
function conflict() { return new TaskConflictError("다른 화면에서 업무가 변경됐습니다. 새로고침 후 다시 확인해 주세요."); }

export async function setProjectCompleted(projectIdInput: string, completed: boolean, expectedStatus: string) {
  await requireEditAccess("projects");
  const projectId = parseTaskId(projectIdInput);
  if (typeof completed !== "boolean" || !["active", "completed", "on_hold"].includes(expectedStatus)) throw new TaskInputError("프로젝트 상태를 확인해 주세요.");
  return prisma.$transaction(async tx => {
    const project = await lockProject(tx, projectId);
    const status = completed ? "completed" : "active";
    if (project.status !== expectedStatus && project.status !== status) throw new TaskConflictError("다른 화면에서 프로젝트 상태가 변경됐습니다. 새로고침 후 다시 확인해 주세요.");
    const [total, done] = completed ? [0, 0] : await Promise.all([
      tx.checklistItem.count({ where: { projectId } }), tx.checklistItem.count({ where: { projectId, isDone: true } }),
    ]);
    const progress = completed ? 100 : total ? Math.round(done / total * 100) : 0;
    await tx.project.update({ where: { id: projectId }, data: { status, progress } });
    return { projectId, status, progress };
  });
}

export async function createProjectTask(draft: TaskDraft, requestId: string) {
  await requireEditAccess("projects");
  const id = parseTaskId(requestId);
  if (id.startsWith("reminder-")) throw new TaskInputError("자동 리마인드 ID로 새 업무를 만들 수 없습니다.");
  return prisma.$transaction(async tx => {
    await lockProject(tx, draft.projectId);
    const existing = await tx.checklistItem.findUnique({ where: { id }, select: PROJECT_TASK_SELECT });
    if (existing) {
      if (existing.projectId !== draft.projectId || existing.content !== draft.content) throw conflict();
      return projectTaskDto(existing);
    }
    await checkAssignee(tx, draft.assigneeId);
    const last = await tx.checklistItem.aggregate({ where: { projectId: draft.projectId }, _max: { order: true } });
    const row = await tx.checklistItem.create({ data: { ...draft, id, order: (last._max.order ?? -1) + 1 }, select: PROJECT_TASK_SELECT });
    await syncTaskProgress(tx, draft.projectId);
    return projectTaskDto(row);
  });
}
export async function editProjectTask(idInput: string, draft: TaskDraft, expectedVersion: number) {
  await requireEditAccess("projects");
  const id = parseTaskId(idInput), version = parseTaskVersion(expectedVersion);
  return prisma.$transaction(async tx => {
    await lockProject(tx, draft.projectId);
    if (id.startsWith("reminder-")) {
      const project = await tx.project.findUniqueOrThrow({ where: { id: draft.projectId }, select: { eventDate: true } });
      if (draft.dueDate !== project.eventDate) throw new TaskInputError("실제 일정은 프로젝트의 과업·실제 일정에서 수정해 주세요.");
    }
    await checkAssignee(tx, draft.assigneeId);
    const changed = await tx.checklistItem.updateMany({ where: { id, projectId: draft.projectId, version }, data: { ...draft, version: { increment: 1 } } });
    if (changed.count !== 1) throw conflict();
    return projectTaskDto(await tx.checklistItem.findUniqueOrThrow({ where: { id }, select: PROJECT_TASK_SELECT }));
  });
}
export async function completeProjectTask(idInput: string, projectIdInput: string, done: boolean, expectedVersion?: number) {
  await requireEditAccess("projects");
  const id = parseTaskId(idInput), projectId = parseTaskId(projectIdInput);
  if (typeof done !== "boolean") throw new TaskInputError("완료 여부를 확인해 주세요.");
  if (expectedVersion !== undefined) parseTaskVersion(expectedVersion);
  return prisma.$transaction(async tx => {
    await lockProject(tx, projectId);
    const row = await tx.checklistItem.findUnique({ where: { id }, select: PROJECT_TASK_SELECT });
    if (!row || row.projectId !== projectId) throw new TaskInputError("업무를 찾을 수 없습니다.");
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw conflict();
    if (row.isDone === done) return projectTaskDto(row);
    const changed = await tx.checklistItem.updateMany({ where: { id, projectId, version: row.version }, data: {
      isDone: done, completedAt: done ? new Date() : null, version: { increment: 1 },
    } });
    if (changed.count !== 1) throw conflict();
    await syncTaskProgress(tx, projectId);
    return projectTaskDto(await tx.checklistItem.findUniqueOrThrow({ where: { id }, select: PROJECT_TASK_SELECT }));
  });
}
export async function removeProjectTask(idInput: string, projectIdInput: string, expectedVersion?: number) {
  await requireEditAccess("projects");
  const id = parseTaskId(idInput), projectId = parseTaskId(projectIdInput);
  if (id.startsWith("reminder-")) throw new TaskInputError("자동 리마인드는 프로젝트의 과업·실제 일정에서 변경해 주세요.");
  if (expectedVersion !== undefined) parseTaskVersion(expectedVersion);
  return prisma.$transaction(async tx => {
    await lockProject(tx, projectId);
    const deleted = await tx.checklistItem.deleteMany({ where: { id, projectId, ...(expectedVersion === undefined ? {} : { version: expectedVersion }) } });
    if (deleted.count !== 1) throw conflict();
    await syncTaskProgress(tx, projectId);
    return { id };
  });
}
