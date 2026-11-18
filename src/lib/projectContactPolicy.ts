import { parseFollowUpDate } from "@/lib/privateInboxPolicy";
import type { InquiryInboxItem } from "@/lib/inquiryInbox";
import { isExternal } from "@/lib/calendarVisibility";
import { isDotReadOnly } from "@/lib/dotPolicy";

export const PROJECT_CONTACT_LABELS = {
  unrecorded: "미기록", quote_sent: "견적서 보냄", called: "전화함", waiting: "회신 대기",
  confirmed: "진행 확정", on_hold: "보류", closed: "연락 종료",
};
export type ProjectContactStatus = keyof typeof PROJECT_CONTACT_LABELS;
export function isProjectContactStatus(value: unknown): value is ProjectContactStatus {
  return typeof value === "string" && Object.hasOwn(PROJECT_CONTACT_LABELS, value);
}
export class ProjectContactInputError extends Error {}
export function canViewProjectContacts(user: { id: string; role?: string | null; active?: boolean; isAgent?: boolean; partnerId?: string | null; customerId?: string | null; venueId?: string | null }) {
  return Boolean(user.id && user.role && user.role !== "pending" && user.active !== false && !user.isAgent && !isDotReadOnly(user.role) && !isExternal({ id: user.id, role: user.role, partnerId: user.partnerId ?? null, customerId: user.customerId ?? null, venueId: user.venueId ?? null }));
}
export interface ProjectContactView {
  id: string; name: string; projectStatus: string; client: string | null; assignee: string | null;
  workScope: string | null; createdAt: string; contactStatus: ProjectContactStatus; note: string;
  nextContactAt: string | null; version: number; updatedAt: string | null;
  history: { id: string; status: ProjectContactStatus; note: string; nextContactAt: string | null; recordedAt: string; recordedBy: string }[];
}
export function parseProjectContact(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("projectId" in value) || !("requestId" in value) || !("version" in value) || !("status" in value) || !("note" in value) || !("nextContactAt" in value)) throw new ProjectContactInputError("연락 기록 입력을 확인해 주세요.");
  const { projectId, requestId, version, status, note, nextContactAt } = value;
  if (typeof projectId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(projectId) || typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId) || typeof version !== "number" || !Number.isSafeInteger(version) || version < 0 || !isProjectContactStatus(status) || typeof note !== "string" || note.length > 2000) throw new ProjectContactInputError("상태·메모·저장 버전을 확인해 주세요.");
  let date: Date | null;
  try { date = parseFollowUpDate(nextContactAt); }
  catch { throw new ProjectContactInputError("다음 연락 일시를 확인해 주세요. 미정이면 비워두세요."); }
  return { projectId, requestId, version, status, note: note.trim(), nextContactAt: date };
}
export function projectContactToInboxItem(project: ProjectContactView): InquiryInboxItem {
  const recordedAt = project.updatedAt ?? project.createdAt;
  return { key: `project:${project.id}`, branch: "project", category: "프로젝트", title: project.name,
    name: project.client || "거래처 미정", email: "", phone: "", receivedAt: recordedAt,
    receivedTime: new Date(recordedAt).getTime(), body: `업무 범위: ${project.workScope || "과업 미등록"}${project.note ? `\n\n연락 메모: ${project.note}` : ""}`,
    status: PROJECT_CONTACT_LABELS[project.contactStatus], assignee: project.assignee || "담당자 미정",
    waitingForContact: project.contactStatus === "unrecorded", completed: project.projectStatus === "completed" || project.contactStatus === "closed" };
}
