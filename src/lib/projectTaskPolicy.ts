import type { ChecklistItem } from "@prisma/client";

export const TASK_STATUS_LABELS = { todo: "미착수", in_progress: "진행 중", waiting: "회신 대기" };
export type OpenTaskStatus = keyof typeof TASK_STATUS_LABELS;
export type ProjectTask = Omit<ChecklistItem, "createdAt" | "updatedAt" | "completedAt"> & {
  completedAt: string | null;
  assigneeName: string | null;
};
export type TaskPerson = { id: string; name: string | null; label?: string };
export type TaskProject = { id: string; name: string; status: string; assignee?: string | null };
export type TaskDraft = Pick<ProjectTask, "projectId" | "content" | "assigneeId" | "nextCheckDate" | "dueDate" | "waitingOn"> & { taskStatus: OpenTaskStatus };
export type TaskResult<T> = { ok: true; data: T } | { ok: false; message: string };

export class TaskInputError extends Error {}
export class TaskConflictError extends Error {}

export function defaultTaskAssignee(people: readonly TaskPerson[], projectAssignee?: string | null): string {
  const name = projectAssignee?.trim().toLowerCase();
  if (!name) return "";
  const matches = people.filter(person => person.name?.toLowerCase() === name);
  return matches.length === 1 ? matches[0].id : "";
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TaskInputError("업무 입력을 확인해 주세요.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, limit: number, required = false): string | null {
  if (value == null || value === "") {
    if (required) throw new TaskInputError(`${label}을 입력해 주세요.`);
    return null;
  }
  if (typeof value !== "string" || value.trim().length > limit) throw new TaskInputError(`${label}은 ${limit}자 이내로 입력해 주세요.`);
  const result = value.trim();
  if (required && !result) throw new TaskInputError(`${label}을 입력해 주세요.`);
  return result || null;
}
export function parseTaskId(value: unknown): string {
  const id = text(value, "업무 ID", 100, true);
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new TaskInputError("업무 ID가 올바르지 않습니다.");
  return id;
}
export function parseTaskVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TaskInputError("업무 버전을 확인해 주세요.");
  return value;
}
export function parseTaskDate(value: unknown): string | null {
  const date = text(value, "날짜", 10);
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TaskInputError("날짜를 YYYY-MM-DD 형식으로 입력해 주세요.");
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || parsed.getUTCFullYear() !== y || parsed.getUTCMonth() + 1 !== m || parsed.getUTCDate() !== d) throw new TaskInputError("실제 달력에 있는 날짜를 입력해 주세요.");
  return date;
}
export function parseTaskDraft(value: unknown): TaskDraft {
  const input = objectInput(value);
  const taskStatus = input.taskStatus;
  if (taskStatus !== "todo" && taskStatus !== "in_progress" && taskStatus !== "waiting") throw new TaskInputError("업무 상태를 선택해 주세요.");
  const content = text(input.content, "할 일", 300, true);
  if (!content) throw new TaskInputError("할 일을 입력해 주세요.");
  return {
    projectId: parseTaskId(input.projectId), content, taskStatus,
    assigneeId: input.assigneeId == null || input.assigneeId === "" ? null : parseTaskId(input.assigneeId),
    nextCheckDate: parseTaskDate(input.nextCheckDate), dueDate: parseTaskDate(input.dueDate),
    waitingOn: taskStatus === "waiting" ? text(input.waitingOn, "대기 상대", 120) : null,
  };
}

type DatedTask = Pick<ProjectTask, "nextCheckDate" | "dueDate">;
export function taskAttention(task: DatedTask): { date: string; kind: "check" | "due" | "both" } | null {
  const check = task.nextCheckDate, due = task.dueDate;
  if (check && due && check === due) return { date: check, kind: "both" };
  if (check && (!due || check < due)) return { date: check, kind: "check" };
  if (due) return { date: due, kind: "due" };
  return null;
}
export function taskAttentionLabel(task: DatedTask, today: string): string {
  const attention = taskAttention(task);
  if (!attention) return "날짜 미정";
  const word = attention.kind === "check" ? "확인" : attention.kind === "due" ? "마감" : "확인·마감";
  if (attention.date === today) return `오늘 ${word}`;
  const short = attention.date.slice(5).replace("-", "/");
  return `${short} ${word}${attention.date < today ? "일 지남" : ""}`;
}
export function compareTasks(a: ProjectTask, b: ProjectTask): number {
  return (taskAttention(a)?.date ?? "9999").localeCompare(taskAttention(b)?.date ?? "9999") || a.order - b.order || a.id.localeCompare(b.id);
}
export function nextProjectTask(tasks: readonly ProjectTask[]): ProjectTask | null {
  return tasks.filter(task => !task.isDone).sort(compareTasks)[0] ?? null;
}
export const TODAY_TASK_GROUPS = [
  { id: "overdue", label: "마감 지남" },
  { id: "due", label: "오늘 마감" },
  { id: "check", label: "오늘 확인" },
] as const;

export function todayTaskGroup(task: DatedTask, today: string): typeof TODAY_TASK_GROUPS[number]["id"] {
  return task.dueDate && task.dueDate < today ? "overdue" : task.dueDate === today ? "due" : "check";
}

export function todayTaskLabel(task: DatedTask, today: string) {
  const group = todayTaskGroup(task, today);
  if (group === "check" && task.nextCheckDate && task.nextCheckDate < today) return "확인 지남";
  return TODAY_TASK_GROUPS.find(entry => entry.id === group)?.label ?? "오늘 확인";
}

export function todayProjectTasks<T extends ProjectTask>(tasks: readonly T[], today: string, ownerId: string | null): T[] {
  const priority = { overdue: 0, due: 1, check: 2 };
  return tasks.filter(task => !task.isDone && (ownerId === null || task.assigneeId === ownerId) && (taskAttention(task)?.date ?? "9999") <= today)
    .sort((a, b) => {
      const aGroup = todayTaskGroup(a, today), bGroup = todayTaskGroup(b, today);
      const aDate = aGroup === "check" ? a.nextCheckDate : a.dueDate;
      const bDate = bGroup === "check" ? b.nextCheckDate : b.dueDate;
      return priority[aGroup] - priority[bGroup] || (aDate ?? "").localeCompare(bDate ?? "") || a.order - b.order || a.id.localeCompare(b.id);
    });
}

export function projectTaskPreview<T extends ProjectTask>(ordered: readonly T[]) {
  return { total: ordered.length, tasks: ordered.slice(0, 5) };
}

export function canRecheckTaskTomorrow(task: Pick<ProjectTask, "isDone" | "taskStatus" | "nextCheckDate">, today: string) {
  return !task.isDone && task.taskStatus === "waiting" && (!task.nextCheckDate || task.nextCheckDate <= today);
}

export type TaskCalendarEvent = {
  id: string; taskId: string; projectId: string; date: string; title: string; type: "task"; isDone: boolean;
};
export function projectTaskCalendarEvents(tasks: readonly (ProjectTask & { projectName: string })[], start: string, end: string): TaskCalendarEvent[] {
  return tasks.flatMap(task => {
    const dates = task.nextCheckDate === task.dueDate && task.nextCheckDate
      ? [{ date: task.nextCheckDate, label: "확인·마감", suffix: "both" }]
      : [{ date: task.nextCheckDate, label: "확인", suffix: "check" }, { date: task.dueDate, label: "마감", suffix: "due" }];
    return dates.flatMap(({ date, label, suffix }) => date && date >= start && date <= end ? [{
      id: `task:${task.id}:${suffix}`, taskId: task.id, projectId: task.projectId, date,
      title: task.id.startsWith("reminder-") && date === task.dueDate ? `${task.projectName} · 실제 공연·행사일` : `${task.isDone ? "완료 · " : ""}${task.projectName} · ${task.content} ${label}`,
      type: "task", isDone: task.id.startsWith("reminder-") && date === task.dueDate ? false : task.isDone,
    }] : []);
  });
}
