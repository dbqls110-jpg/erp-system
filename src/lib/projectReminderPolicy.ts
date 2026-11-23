import { parseTaskDate, parseTaskId, TaskInputError } from "./projectTaskPolicy";

export const EVENT_TYPES = { general: "일반 업무", performance: "공연", event: "행사" };
export type ProjectWorkspaceDraft = { workScope: string | null; eventType: keyof typeof EVENT_TYPES; eventDate: string | null; initialTasks: string[]; initialAssigneeId: string | null };
export function parseProjectWorkspace(input: unknown): ProjectWorkspaceDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TaskInputError("과업 입력을 확인해 주세요.");
  const value = input as Record<string, unknown>;
  const scope = value.workScope ?? "", type = value.eventType ?? "general", tasks = value.initialTasks ?? "";
  if (typeof scope !== "string" || scope.trim().length > 1000) throw new TaskInputError("업무 범위는 1000자 이내로 입력해 주세요.");
  if (type !== "general" && type !== "performance" && type !== "event") throw new TaskInputError("업무 유형을 선택해 주세요.");
  if (typeof tasks !== "string" || tasks.length > 15_500) throw new TaskInputError("할 일은 한 줄에 하나씩 입력해 주세요.");
  const initialTasks = tasks.split(/\r?\n/).map(task => task.trim()).filter(Boolean);
  if (initialTasks.length > 50 || initialTasks.some(task => task.length > 300)) throw new TaskInputError("할 일은 50개까지, 한 줄에 300자 이내로 입력해 주세요.");
  return { workScope: scope.trim() || null, eventType: type, eventDate: parseTaskDate(value.eventDate), initialTasks,
    initialAssigneeId: value.initialAssigneeId == null || value.initialAssigneeId === "" ? null : parseTaskId(value.initialAssigneeId) };
}
export function eventReminder(type: string, date: string | null, registered: string): { date: string; content: string } | null {
  if (type === "general" || !date || date < registered) return null;
  const [y, m, d] = date.split("-").map(Number);
  const event = new Date(Date.UTC(y, m - 1, d));
  const leadDays = (event.getTime() - new Date(`${registered}T00:00:00Z`).getTime()) / 86_400_000;
  let target: Date, label: string;
  if (type === "performance") {
    const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    target = new Date(Date.UTC(y, m - 2, Math.min(d, lastDay))); label = "공연 한 달 전 준비 확인";
  } else {
    const days = leadDays > 7 ? 7 : 1;
    target = new Date(event.getTime() - days * 86_400_000); label = days === 7 ? "행사 일주일 전 준비 확인" : "행사 하루 전 준비 확인";
  }
  const targetDate = target.toISOString().slice(0, 10);
  return { date: targetDate < registered ? registered : targetDate, content: `${label} (${date})` };
}
