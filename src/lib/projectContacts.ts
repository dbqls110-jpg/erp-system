import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/actionGuards";
import { canAccessMenu, canEditMenu, requireMenuEdit } from "@/lib/permissions";
import { canViewProjectContacts, isProjectContactStatus, parseProjectContact, ProjectContactInputError, type ProjectContactView } from "@/lib/projectContactPolicy";

const contactSelect = {
  id: true, name: true, status: true, client: true, assignee: true, workScope: true, createdAt: true,
  contactState: true,
  contactLogs: { select: { id: true, status: true, note: true, nextContactAt: true, recordedAt: true, recordedBy: true }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }], take: 10 },
} satisfies Prisma.ProjectSelect;
type ContactRow = Prisma.ProjectGetPayload<{ select: typeof contactSelect }>;
function contactDto(row: ContactRow): ProjectContactView {
  const state = row.contactState;
  const contactStatus = state?.status ?? "unrecorded";
  if (!isProjectContactStatus(contactStatus)) throw Error("Invalid stored contact status");
  return { id: row.id, name: row.name, projectStatus: row.status, client: row.client, assignee: row.assignee, workScope: row.workScope, createdAt: row.createdAt.toISOString(), contactStatus, note: state?.note ?? "", nextContactAt: state?.nextContactAt?.toISOString() ?? null, version: state?.version ?? 0, updatedAt: state?.updatedAt.toISOString() ?? null,
    history: row.contactLogs.map(log => { if (!isProjectContactStatus(log.status)) throw Error("Invalid stored contact status"); return { ...log, status: log.status, nextContactAt: log.nextContactAt?.toISOString() ?? null, recordedAt: log.recordedAt.toISOString() }; }) };
}
async function requireContactReader() {
  const { user } = await requireSessionUser();
  if (!canViewProjectContacts(user)) throw Error("Forbidden");
  const principal = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, role: true, active: true, isAgent: true, partnerId: true, customerId: true, venueId: true } });
  if (!principal || !canViewProjectContacts(principal) || !await canAccessMenu(principal.id, "projects")) throw Error("Forbidden");
  return principal;
}
export async function getProjectContacts() {
  const user = await requireContactReader();
  const [rows, canEdit] = await Promise.all([
    prisma.project.findMany({ select: contactSelect, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 200 }),
    canEditMenu(user.id, "projects", user.role),
  ]);
  return { items: rows.map(contactDto), canEdit };
}
export async function getProjectContact(projectId: string) {
  await requireContactReader();
  const row = await prisma.project.findUnique({ where: { id: projectId }, select: contactSelect });
  return row ? contactDto(row) : null;
}
export async function recordProjectContact(input: unknown): Promise<ProjectContactView> {
  const user = await requireContactReader();
  await requireMenuEdit(user.id, "projects", user.role);
  const draft = parseProjectContact(input);
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "projects" WHERE "id" = ${draft.projectId} FOR UPDATE`;
    if (!locked.length) throw new ProjectContactInputError("프로젝트를 찾을 수 없습니다.");
    const oldRequest = await tx.projectContactLog.findUnique({ where: { id: draft.requestId } });
    if (oldRequest) {
      if (oldRequest.projectId !== draft.projectId || oldRequest.status !== draft.status || oldRequest.note !== draft.note || oldRequest.nextContactAt?.toISOString() !== draft.nextContactAt?.toISOString()) throw new ProjectContactInputError("같은 저장 요청의 내용이 달라졌습니다. 새로고침 후 다시 확인해 주세요.");
      return contactDto(await tx.project.findUniqueOrThrow({ where: { id: draft.projectId }, select: contactSelect }));
    }
    const current = await tx.projectContactState.findUnique({ where: { projectId: draft.projectId } });
    if ((current?.version ?? 0) !== draft.version) throw new ProjectContactInputError("다른 화면에서 연락 상태가 변경됐습니다. 새로고침 후 다시 확인해 주세요.");
    const data = { status: draft.status, note: draft.note, nextContactAt: draft.nextContactAt };
    await tx.projectContactState.upsert({ where: { projectId: draft.projectId }, create: { projectId: draft.projectId, ...data }, update: { ...data, version: { increment: 1 } } });
    await tx.projectContactLog.create({ data: { id: draft.requestId, projectId: draft.projectId, ...data, recordedBy: user.name || "담당자" } });
    await tx.project.update({ where: { id: draft.projectId }, data: { updatedAt: new Date() } });
    return contactDto(await tx.project.findUniqueOrThrow({ where: { id: draft.projectId }, select: contactSelect }));
  });
}
