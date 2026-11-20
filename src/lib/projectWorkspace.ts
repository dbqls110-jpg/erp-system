import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { requireEditAccess } from "@/lib/actionGuards";
import { currentKoreanDateKey } from "./dateFormat";
import { eventReminder, parseProjectWorkspace, type ProjectWorkspaceDraft } from "./projectReminderPolicy";
import { parseTaskId, parseTaskVersion, TaskConflictError, TaskInputError } from "./projectTaskPolicy";

export function reminderId(projectId: string) { return `reminder-${createHash("sha256").update(projectId).digest("hex").slice(0, 32)}`; }
export async function syncEventReminder(tx: Prisma.TransactionClient, project: { id: string; eventType: string; eventDate: string | null }, assigneeId: string, today: string) {
  const reminder = eventReminder(project.eventType, project.eventDate, today), id = reminderId(project.id);
  if (!reminder) {
    await tx.checklistItem.deleteMany({ where: { id, projectId: project.id, isDone: false } });
    await tx.checklistItem.updateMany({ where: { id, projectId: project.id, isDone: true, dueDate: { not: null } }, data: { dueDate: null, version: { increment: 1 } } });
  } else {
    const old = await tx.checklistItem.findUnique({ where: { id } });
    if (old) {
      await tx.checklistItem.update({ where: { id }, data: { content: reminder.content, nextCheckDate: reminder.date, dueDate: project.eventDate, isDone: false, completedAt: null, taskStatus: "todo", version: { increment: 1 } } });
    } else {
      const last = await tx.checklistItem.aggregate({ where: { projectId: project.id }, _max: { order: true } });
      await tx.checklistItem.create({ data: { id, projectId: project.id, content: reminder.content, assigneeId, nextCheckDate: reminder.date, dueDate: project.eventDate, order: (last._max.order ?? -1) + 1 } });
    }
  }
}
export async function saveProjectWorkspace(projectIdInput: string, input: unknown, expectedVersion: number) {
  const session = await requireEditAccess("projects"), id = parseTaskId(projectIdInput), version = parseTaskVersion(expectedVersion);
  const draft = parseProjectWorkspace(input);
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "projects" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw new TaskInputError("프로젝트를 찾을 수 없습니다.");
    const old = await tx.project.findUniqueOrThrow({ where: { id } });
    if (old.workspaceVersion !== version) throw new TaskConflictError("다른 화면에서 과업이 변경됐습니다. 새로고침 후 확인해 주세요.");
    const { initialTasks, ...metadata } = draft;
    const updated = await tx.project.update({ where: { id }, data: { ...metadata, workspaceVersion: { increment: 1 } } });
    if (old.eventDate !== draft.eventDate || old.eventType !== draft.eventType) await syncEventReminder(tx, updated, session.user.id, currentKoreanDateKey());
    await appendInitialTasks(tx, id, initialTasks, session.user.id);
    const [total, done] = await Promise.all([tx.checklistItem.count({ where: { projectId: id } }), tx.checklistItem.count({ where: { projectId: id, isDone: true } })]);
    await tx.project.update({ where: { id }, data: { progress: old.status === "completed" ? 100 : total ? Math.round(done / total * 100) : 0 } });
    return { id };
  });
}
export async function appendInitialTasks(tx: Prisma.TransactionClient, projectId: string, tasks: ProjectWorkspaceDraft["initialTasks"], assigneeId: string) {
  if (!tasks.length) return;
  const last = await tx.checklistItem.aggregate({ where: { projectId }, _max: { order: true } });
  await tx.checklistItem.createMany({ data: tasks.map((content, index) => ({ projectId, content, assigneeId, order: (last._max.order ?? -1) + index + 1 })) });
}
