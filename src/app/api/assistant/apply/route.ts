import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { addChecklistItem, createProject, setChecklistDone } from "@/app/actions/project";
import { createProjectAmount, type ProjectAmountInput } from "@/app/actions/projectAmount";
import { createCustomer, updateCustomer, createPartner, updatePartner } from "@/app/actions/partnerCustomer";
import { addExpense } from "@/app/actions/finance";
import { createCalendarEvent } from "@/app/actions/calendar";
import { applyLeave } from "@/app/actions/leave";
import { sendMessage } from "@/app/actions/message";
import {
  getInquiryByIdentity,
  getInquiries,
  saveInquiryMemo,
  saveInquiryStage,
} from "@/lib/inquirySheet";
import { getSpaceRegistrations, saveSpaceRegistrationMemo, saveSpaceRegistrationStage } from "@/lib/spaceRegistrationSheet";
import { getSpaceRentals, saveSpaceRentalStage } from "@/lib/spaceRentalSheet";
import { formatCurrentDateTime, type InquiryStage } from "@/lib/inquiries";
import type { SpaceRegistrationStage } from "@/lib/spaceRegistrations";
import type { SpaceRentalStage } from "@/lib/spaceRentals";
import { PROPOSAL_CANCEL_ACTION } from "@/lib/proposalStates";
import { prisma } from "@/lib/prisma";
import { canAccessMenu, canEditMenu } from "@/lib/permissions";
import { calculateNetIncome } from "@/lib/financeMetrics";
import {
  parseProposals,
  validateProposal,
  type ChecklistDoneContent,
  type CalendarCreateContent,
  type CustomerFields,
  type ExpenseCreateContent,
  type InquiryBranch,
  type InquiryMemoContent,
  type InquiryMoveContent,
  type LeaveRequestContent,
  type MessageSendContent,
  type PartnerFields,
  type ProjectAmountContent,
  type ProjectCreateFields,
  type ProjectChecklistContent,
  type SheetCreateContent,
  type ProposalTarget,
} from "@/lib/assistantProposal";
import {
  moveMessengerFileToCategory,
  moveMessengerFileToProject,
} from "@/lib/googleDrive";
import { createSpreadsheet, SheetCreationError } from "@/lib/sheetCreation";

/**
 * 비서가 내놓은 변경 제안을 실제로 적용한다.
 *
 * 적용은 사람이 화면에서 누를 때만 일어난다. AI 는 제안만 하고 쓰지 않는다.
 * 그래서 이 라우트는 "AI 가 뭐라고 했는지" 를 믿지 않는다. job 을 다시 읽어
 * 그 답변 안에 정말 그 제안이 들어 있었는지 확인한 뒤에 적용한다.
 * 그러지 않으면 요청을 손으로 만들어 아무 값이나 쓸 수 있다.
 */

/** 대상마다 어느 메뉴의 수정 권한이 필요한지. */
const MENU_FOR: Record<ProposalTarget, string> = {
  venue: "venues",
  partner: "partners",
  project: "projects",
  drive_file: "messenger",
  sheet_create: "sheets",
  project_checklist: "projects",
  project_create: "projects",
  checklist_done: "projects",
  project_amount: "projects",
  inquiry_move: "inquiries",
  inquiry_memo: "inquiries",
  customer_create: "customers",
  customer_update: "customers",
  partner_create: "partners",
  partner_update: "partners",
  expense_create: "finance",
  calendar_create: "calendar",
  leave_request: "leave",
  message_send: "messenger",
};

const STRICT_NEW_TARGETS = new Set<ProposalTarget>([
  "inquiry_move", "inquiry_memo",
  "customer_create", "customer_update", "partner_create", "partner_update",
  "expense_create", "calendar_create", "leave_request", "message_send",
]);

interface ExistingSheetApply {
  title: string;
  url: string;
  folderPath?: string;
}

interface ExistingProjectChecklistApply {
  name: string;
  addedCount: number;
  alreadyExistingCount: number;
}

interface ExistingProjectCreateApply {
  projectId: string;
  name: string;
}

interface ExistingChecklistDoneApply {
  name: string;
  foundCount: number;
  notFoundCount: number;
  done: boolean;
}

interface ExistingProjectAmountApply {
  name: string;
  revenue: number | null;
  cost: number | null;
  netIncome: number | null;
  entryCount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function contextDataFromPrompt(input: string | null): Record<string, unknown> | null {
  if (!input) return null;
  const dataMarker = "[ERP 자료]";
  const questionMarker = "[질문]";
  // 지시문에도 “[ERP 자료]”가 여러 번 나오므로 실제 주입 데이터의 마지막 표식을 쓴다.
  const start = input.lastIndexOf(dataMarker);
  const end = input.indexOf(questionMarker, start + dataMarker.length);
  if (start < 0 || end < 0) return null;
  try {
    return asRecord(JSON.parse(input.slice(start + dataMarker.length, end).trim()));
  } catch {
    return null;
  }
}

function contextItems(data: Record<string, unknown> | null, key: string): Record<string, unknown>[] {
  const section = data ? asRecord(data[key]) : null;
  return section && Array.isArray(section.items)
    ? section.items.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function contextHasId(
  data: Record<string, unknown> | null,
  collection: string,
  id: string,
): boolean {
  return contextItems(data, collection).some((item) => item.id === id);
}

function contextHasInquiryId(
  data: Record<string, unknown> | null,
  branch: InquiryBranch,
  id: string,
): boolean {
  const inquiries = data ? asRecord(data.inquiries) : null;
  const branchData = inquiries ? asRecord(inquiries[branch]) : null;
  const items = branchData && Array.isArray(branchData.items) ? branchData.items : [];
  return items.some((item) => asRecord(item)?.id === id);
}

function getContextIdRequirement(
  proposal: ReturnType<typeof parseProposals>[number],
): { collection: string; id: string } | { inquiryBranch: InquiryBranch; id: string } | null {
  if (proposal.target === "customer_update") return { collection: "customers", id: proposal.id };
  if (proposal.target === "partner_update") return { collection: "partners", id: proposal.id };
  if (proposal.target === "inquiry_move" || proposal.target === "inquiry_memo") {
    const branch = proposal.changes.branch;
    if (branch === "customer" || branch === "space" || branch === "rental") {
      return { inquiryBranch: branch, id: proposal.id };
    }
    return null;
  }
  if (proposal.target === "message_send") {
    const to = proposal.changes.to;
    return typeof to === "string" ? { collection: "users", id: to } : null;
  }
  if (proposal.target === "calendar_create") {
    const projectId = proposal.changes.projectId;
    return typeof projectId === "string" && projectId.trim()
      ? { collection: "projects", id: projectId.trim() }
      : null;
  }
  return null;
}

function hasRequiredContextId(
  data: Record<string, unknown> | null,
  requirement: ReturnType<typeof getContextIdRequirement>,
): boolean {
  if (!requirement) return true;
  if ("collection" in requirement) return contextHasId(data, requirement.collection, requirement.id);
  return contextHasInquiryId(data, requirement.inquiryBranch, requirement.id);
}

function appendMemo(current: string, memo: string): string {
  const entry = `${formatCurrentDateTime()} ${memo.trim()}`;
  return current.trim() ? `${current.trim()}\n${entry}` : entry;
}

async function findExistingSheetApply(jobId: string, index: number): Promise<ExistingSheetApply | null> {
  // 감사 로그에 같은 job과 제안 위치가 있으면 Google API를 다시 부르지 않는다.
  const logs = await prisma.agentAuditLog.findMany({
    where: { action: "assistant_apply_sheet_create" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, result: true },
  });
  const match = logs.find((log) => {
    const payload = asRecord(log.payload);
    return payload?.jobId === jobId && payload?.index === index;
  });
  const result = asRecord(match?.result);
  if (typeof result?.title !== "string" || typeof result.url !== "string") return null;
  return {
    title: result.title,
    url: result.url,
    folderPath: typeof result.folderPath === "string" ? result.folderPath : undefined,
  };
}

async function findExistingProjectChecklistApply(
  jobId: string,
  index: number,
): Promise<ExistingProjectChecklistApply | null> {
  // 감사 로그에 같은 job과 제안 위치가 있으면 체크리스트를 다시 만들지 않는다.
  const logs = await prisma.agentAuditLog.findMany({
    where: { action: "assistant_apply_project_checklist" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, result: true },
  });
  const match = logs.find((log) => {
    const payload = asRecord(log.payload);
    return payload?.jobId === jobId && payload?.index === index;
  });
  const result = asRecord(match?.result);
  if (
    typeof result?.name !== "string" ||
    typeof result.addedCount !== "number" ||
    typeof result.alreadyExistingCount !== "number"
  ) {
    return null;
  }
  return {
    name: result.name,
    addedCount: result.addedCount,
    alreadyExistingCount: result.alreadyExistingCount,
  };
}

async function findExistingProjectCreateApply(
  jobId: string,
  index: number,
): Promise<ExistingProjectCreateApply | null> {
  const logs = await prisma.agentAuditLog.findMany({
    where: { action: "assistant_apply_project_create" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, result: true },
  });
  const match = logs.find((log) => {
    const payload = asRecord(log.payload);
    return payload?.jobId === jobId && payload?.index === index;
  });
  const result = asRecord(match?.result);
  if (typeof result?.projectId !== "string" || typeof result.name !== "string") return null;
  return { projectId: result.projectId, name: result.name };
}

async function findExistingChecklistDoneApply(
  jobId: string,
  index: number,
): Promise<ExistingChecklistDoneApply | null> {
  const logs = await prisma.agentAuditLog.findMany({
    where: { action: "assistant_apply_checklist_done" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, result: true },
  });
  const match = logs.find((log) => {
    const payload = asRecord(log.payload);
    return payload?.jobId === jobId && payload?.index === index;
  });
  const result = asRecord(match?.result);
  if (
    typeof result?.name !== "string" ||
    typeof result.foundCount !== "number" ||
    typeof result.notFoundCount !== "number" ||
    typeof result.done !== "boolean"
  ) return null;
  return {
    name: result.name,
    foundCount: result.foundCount,
    notFoundCount: result.notFoundCount,
    done: result.done,
  };
}

async function findExistingProjectAmountApply(
  jobId: string,
  index: number,
): Promise<ExistingProjectAmountApply | null> {
  const logs = await prisma.agentAuditLog.findMany({
    where: { action: "assistant_apply_project_amount" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, result: true },
  });
  const match = logs.find((log) => {
    const payload = asRecord(log.payload);
    return payload?.jobId === jobId && payload?.index === index;
  });
  const result = asRecord(match?.result);
  if (
    typeof result?.name !== "string" ||
    (typeof result.revenue !== "number" && result.revenue !== null) ||
    (typeof result.cost !== "number" && result.cost !== null) ||
    (typeof result.netIncome !== "number" && result.netIncome !== null) ||
    typeof result.entryCount !== "number"
  ) return null;
  return {
    name: result.name,
    revenue: result.revenue,
    cost: result.cost,
    netIncome: result.netIncome,
    entryCount: result.entryCount,
  };
}

async function findExistingApplyResult(
  jobId: string,
  index: number,
  action: string,
): Promise<Record<string, unknown> | null> {
  const logs = await prisma.agentAuditLog.findMany({
    where: { action },
    orderBy: { createdAt: "desc" },
    select: { payload: true, result: true },
  });
  const match = logs.find((log) => {
    const payload = asRecord(log.payload);
    return payload?.jobId === jobId && payload?.index === index;
  });
  return asRecord(match?.result);
}

function checklistComparisonKey(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { jobId?: unknown; index?: unknown; cancel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const index = typeof body.index === "number" ? body.index : 0;
  if (!jobId) return NextResponse.json({ error: "jobId 가 필요합니다." }, { status: 400 });

  if (body.cancel === true) {
    // 취소도 남긴다. 안 남기면 비서를 다시 열 때 그 카드가 또 묻는다.
    const owned = await prisma.agentJob.findFirst({
      where: { id: jobId, userId: session.user.id, visibility: "user" },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });
    await prisma.agentAuditLog.create({
      data: {
        method: "POST",
        endpoint: "/api/assistant/apply",
        action: PROPOSAL_CANCEL_ACTION,
        payload: { jobId, index },
        result: { by: session.user.id },
      },
    });
    return NextResponse.json({ cancelled: true });
  }

  // 본인 대화의 답변만 적용할 수 있다. 남의 job id 를 넣어도 찾지 못한다.
  const job = await prisma.agentJob.findFirst({
    where: { id: jobId, userId: session.user.id, visibility: "user" },
    select: { input: true, output: true, status: true },
  });
  if (!job) return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });
  if (job.status !== "completed" || !job.output) {
    return NextResponse.json({ error: "아직 답변이 완료되지 않았습니다." }, { status: 409 });
  }

  // 화면이 보내온 내용을 그대로 쓰지 않고 답변에서 다시 뽑는다.
  const proposals = parseProposals(job.output);
  const proposal = proposals[index];
  if (!proposal) {
    return NextResponse.json({ error: "그 제안을 찾을 수 없습니다." }, { status: 404 });
  }

  const menuKey = MENU_FOR[proposal.target];
  const hasPermission = proposal.target === "leave_request"
    ? await canAccessMenu(session.user.id, menuKey)
    : await canEditMenu(session.user.id, menuKey, session.user.role);
  if (!hasPermission) {
    return NextResponse.json(
      { error: "이 자료를 고칠 권한이 없습니다." },
      { status: 403 },
    );
  }

  const { accepted, rejected } = validateProposal(proposal);
  if (proposal.target === "sheet_create" && rejected.length > 0) {
    return NextResponse.json(
      { error: "시트 제안에 고칠 항목이 있습니다.", rejected },
      { status: 400 },
    );
  }
  if (proposal.target === "project_create" && rejected.length > 0) {
    return NextResponse.json(
      { error: "프로젝트 만들기 제안에 고칠 항목이 있습니다.", rejected },
      { status: 400 },
    );
  }
  if (STRICT_NEW_TARGETS.has(proposal.target) && rejected.length > 0) {
    return NextResponse.json(
      { error: "제안에 고칠 항목이 있습니다.", rejected },
      { status: 400 },
    );
  }
  if (Object.keys(accepted).length === 0) {
    return NextResponse.json(
      { error: "적용할 수 있는 항목이 없습니다.", rejected },
      { status: 400 },
    );
  }

  const contextRequirement = getContextIdRequirement(proposal);
  if (contextRequirement && !hasRequiredContextId(contextDataFromPrompt(job.input), contextRequirement)) {
    return NextResponse.json(
      { error: "제안의 id가 이 대화의 ERP 자료에 없습니다." },
      { status: 400 },
    );
  }

  try {
    if (proposal.target === "sheet_create") {
      const content = accepted as unknown as SheetCreateContent;
      const existing = await findExistingSheetApply(jobId, index);
      if (existing) {
        return NextResponse.json({
          ok: true,
          name: existing.title,
          url: existing.url,
          folderPath: existing.folderPath,
          reused: true,
        });
      }

      const created = await createSpreadsheet({
        agentType: "agent-1",
        title: content.title,
        folderName: content.folderName,
        tabs: content.tabs,
        data: content.data,
        strictData: true,
      });
      if (!created.spreadsheetId || !created.url) {
        throw new Error("시트 생성 결과가 올바르지 않습니다.");
      }

      await prisma.sheetLink.create({
        data: {
          name: created.finalTitle,
          url: created.url,
          description: `메신저에서 생성 · 저장 폴더: ${created.folderPath}`,
          category: "기타",
          order: 0,
        },
      });

      const rowCount = Object.values(content.data).reduce((count, rows) => count + rows.length, 0);
      await prisma.agentAuditLog.create({
        data: {
          method: "POST",
          endpoint: "/api/assistant/apply",
          action: "assistant_apply_sheet_create",
          payload: { jobId, index, title: created.finalTitle, folderPath: created.folderPath, rowCount },
          result: {
            title: created.finalTitle,
            folderPath: created.folderPath,
            rowCount,
            spreadsheetId: created.spreadsheetId,
            url: created.url,
            by: session.user.id,
          },
        },
      });
      revalidatePath("/sheets");

      return NextResponse.json({
        ok: true,
        name: created.finalTitle,
        url: created.url,
        folderPath: created.folderPath,
      }, { status: 201 });
    }

    if (proposal.target === "project_checklist") {
      const content = accepted as unknown as ProjectChecklistContent;
      const existingApply = await findExistingProjectChecklistApply(jobId, index);
      if (existingApply) {
        return NextResponse.json({
          ok: true,
          name: existingApply.name,
          addedCount: existingApply.addedCount,
          alreadyExistingCount: existingApply.alreadyExistingCount,
          reused: true,
        });
      }

      const project = await prisma.project.findUnique({
        where: { id: proposal.id },
        select: {
          name: true,
          checklistItems: { select: { content: true } },
        },
      });
      if (!project) {
        return NextResponse.json({ error: "지정한 프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }

      const existingItems = new Set(project.checklistItems.map((item) => checklistComparisonKey(item.content)));
      let addedCount = 0;
      let alreadyExistingCount = 0;
      for (const item of content.items) {
        const key = checklistComparisonKey(item);
        if (existingItems.has(key)) {
          alreadyExistingCount += 1;
          continue;
        }
        await addChecklistItem(proposal.id, item);
        existingItems.add(key);
        addedCount += 1;
      }

      await prisma.agentAuditLog.create({
        data: {
          method: "POST",
          endpoint: "/api/assistant/apply",
          action: "assistant_apply_project_checklist",
          payload: {
            jobId,
            index,
            id: proposal.id,
            changes: JSON.parse(JSON.stringify(proposal.changes)),
          },
          result: {
            name: project.name,
            addedCount,
            alreadyExistingCount,
            by: session.user.id,
          },
        },
      });

      return NextResponse.json({
        ok: true,
        name: project.name,
        addedCount,
        alreadyExistingCount,
      });
    }

    if (proposal.target === "project_create") {
      const fields = accepted as unknown as ProjectCreateFields;
      const existingApply = await findExistingProjectCreateApply(jobId, index);
      if (existingApply) {
        return NextResponse.json({
          ok: true,
          name: existingApply.name,
          projectId: existingApply.projectId,
          url: `/projects/${existingApply.projectId}`,
          reused: true,
        });
      }

      const existing = await prisma.project.findFirst({
        where: { name: fields.name },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json({
          ok: true,
          name: existing.name,
          projectId: existing.id,
          url: `/projects/${existing.id}`,
          alreadyExists: true,
        });
      }

      const formData = new FormData();
      for (const [field, value] of Object.entries(fields)) {
        if (typeof value === "string") formData.set(field, value);
      }
      const created = await createProject(formData);
      await prisma.agentAuditLog.create({
        data: {
          method: "POST",
          endpoint: "/api/assistant/apply",
          action: "assistant_apply_project_create",
          payload: { jobId, index, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: {
            name: fields.name,
            projectId: created.projectId,
            by: session.user.id,
          },
        },
      });

      return NextResponse.json({
        ok: true,
        name: fields.name,
        projectId: created.projectId,
        url: `/projects/${created.projectId}`,
      }, { status: 201 });
    }

    if (proposal.target === "checklist_done") {
      const content = accepted as unknown as ChecklistDoneContent;
      const existingApply = await findExistingChecklistDoneApply(jobId, index);
      if (existingApply) {
        return NextResponse.json({ ok: true, ...existingApply, reused: true });
      }

      const project = await prisma.project.findUnique({
        where: { id: proposal.id },
        select: {
          name: true,
          checklistItems: {
            orderBy: { order: "asc" },
            take: 30,
            select: { id: true, content: true },
          },
        },
      });
      if (!project) {
        return NextResponse.json({ error: "지정한 프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }

      const itemsByKey = new Map(
        project.checklistItems.map((item) => [checklistComparisonKey(item.content), item]),
      );
      let foundCount = 0;
      let notFoundCount = 0;
      for (const itemText of content.items) {
        const item = itemsByKey.get(checklistComparisonKey(itemText));
        if (!item) {
          notFoundCount += 1;
          continue;
        }
        await setChecklistDone(item.id, proposal.id, content.done);
        foundCount += 1;
      }

      await prisma.agentAuditLog.create({
        data: {
          method: "POST",
          endpoint: "/api/assistant/apply",
          action: "assistant_apply_checklist_done",
          payload: {
            jobId,
            index,
            id: proposal.id,
            changes: JSON.parse(JSON.stringify(proposal.changes)),
          },
          result: {
            name: project.name,
            foundCount,
            notFoundCount,
            done: content.done,
            by: session.user.id,
          },
        },
      });

      return NextResponse.json({
        ok: true,
        name: project.name,
        foundCount,
        notFoundCount,
        done: content.done,
      });
    }

    if (proposal.target === "project_amount") {
      const content = accepted as unknown as ProjectAmountContent;
      const existingApply = await findExistingProjectAmountApply(jobId, index);
      if (existingApply) {
        return NextResponse.json({ ok: true, ...existingApply, reused: true });
      }

      const before = await prisma.project.findUnique({
        where: { id: proposal.id },
        select: { name: true },
      });
      if (!before) {
        return NextResponse.json({ error: "지정한 프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }

      for (const entry of content.entries) {
        await createProjectAmount(proposal.id, entry as ProjectAmountInput);
      }

      const project = await prisma.project.findUnique({
        where: { id: proposal.id },
        select: { name: true, revenue: true, cost: true },
      });
      if (!project) {
        return NextResponse.json({ error: "적용 뒤 프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }
      const netIncome = calculateNetIncome(project.revenue, project.cost);

      await prisma.agentAuditLog.create({
        data: {
          method: "POST",
          endpoint: "/api/assistant/apply",
          action: "assistant_apply_project_amount",
          payload: {
            jobId,
            index,
            id: proposal.id,
            changes: JSON.parse(JSON.stringify(proposal.changes)),
          },
          result: {
            name: project.name,
            revenue: project.revenue,
            cost: project.cost,
            netIncome,
            entryCount: content.entries.length,
            by: session.user.id,
          },
        },
      });

      return NextResponse.json({
        ok: true,
        name: project.name,
        revenue: project.revenue,
        cost: project.cost,
        netIncome,
        entryCount: content.entries.length,
      });
    }

    if (proposal.target === "inquiry_move") {
      const content = accepted as unknown as InquiryMoveContent;
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_inquiry_move");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });

      let name = proposal.label ?? proposal.id;
      let result: { stage: string; timestamp: string | null };
      if (content.branch === "customer") {
        const inquiry = (await getInquiries()).find((item) => item.id === proposal.id);
        if (!inquiry) return NextResponse.json({ error: "지정한 고객 문의를 찾을 수 없습니다." }, { status: 404 });
        name = inquiry.name || name;
        result = await saveInquiryStage(inquiry.identity, content.stage as InquiryStage);
      } else if (content.branch === "space") {
        const registration = (await getSpaceRegistrations()).find((item) => item.id === proposal.id);
        if (!registration) return NextResponse.json({ error: "지정한 공간 등록을 찾을 수 없습니다." }, { status: 404 });
        name = registration.spaceName || registration.contactName || name;
        result = await saveSpaceRegistrationStage(registration.identity, content.stage as SpaceRegistrationStage);
      } else {
        const rental = (await getSpaceRentals()).find((item) => item.id === proposal.id);
        if (!rental) return NextResponse.json({ error: "지정한 공간대관 문의를 찾을 수 없습니다." }, { status: 404 });
        name = rental.reserverName || rental.eventName || name;
        result = await saveSpaceRentalStage(rental.identity, content.stage as SpaceRentalStage);
      }

      await prisma.agentAuditLog.create({
        data: {
          method: "POST",
          endpoint: "/api/assistant/apply",
          action: "assistant_apply_inquiry_move",
          payload: { jobId, index, id: proposal.id, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { name, branch: content.branch, stage: result.stage, timestamp: result.timestamp, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, name, branch: content.branch, stage: result.stage, timestamp: result.timestamp });
    }

    if (proposal.target === "inquiry_memo") {
      const content = accepted as unknown as InquiryMemoContent;
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_inquiry_memo");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });

      let name = proposal.label ?? proposal.id;
      let memo: string;
      if (content.branch === "customer") {
        const inquiry = (await getInquiries()).find((item) => item.id === proposal.id);
        if (!inquiry) return NextResponse.json({ error: "지정한 고객 문의를 찾을 수 없습니다." }, { status: 404 });
        const current = await getInquiryByIdentity(inquiry.identity);
        name = inquiry.name || name;
        memo = appendMemo(current.memo, content.memo);
        await saveInquiryMemo(inquiry.identity, memo);
      } else if (content.branch === "space") {
        const registration = (await getSpaceRegistrations()).find((item) => item.id === proposal.id);
        if (!registration) return NextResponse.json({ error: "지정한 공간 등록을 찾을 수 없습니다." }, { status: 404 });
        name = registration.spaceName || registration.contactName || name;
        memo = appendMemo(registration.memo, content.memo);
        await saveSpaceRegistrationMemo(registration.identity, memo);
      } else {
        // validateInquiryMemoProposal 에서도 막지만, 검증 코드가 나중에 바뀌어도
        // 메모 저장 함수가 없는 공간대관에 쓰기가 생기지 않도록 이중으로 막는다.
        return NextResponse.json({ error: "공간대관에는 메모를 저장할 수 있는 기존 함수가 없습니다." }, { status: 400 });
      }

      await prisma.agentAuditLog.create({
        data: {
          method: "POST",
          endpoint: "/api/assistant/apply",
          action: "assistant_apply_inquiry_memo",
          payload: { jobId, index, id: proposal.id, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { name, branch: content.branch, memo, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, name, branch: content.branch, memo });
    }

    if (proposal.target === "customer_create") {
      const fields = accepted as unknown as CustomerFields;
      const existing = await prisma.customer.findFirst({
        where: { name: fields.name },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json({ ok: true, name: existing.name, customerId: existing.id, alreadyExists: true });
      }
      await createCustomer({ ...fields, name: fields.name! });
      const created = await prisma.customer.findFirst({
        where: { name: fields.name },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true },
      });
      if (!created) throw new Error("거래처 생성 결과를 확인하지 못했습니다.");
      const result = { name: created.name, customerId: created.id };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_customer_create",
          payload: { jobId, index, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    if (proposal.target === "customer_update") {
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_customer_update");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });
      const before = await prisma.customer.findUnique({ where: { id: proposal.id }, select: { name: true } });
      if (!before) return NextResponse.json({ error: "지정한 거래처를 찾을 수 없습니다." }, { status: 404 });
      await updateCustomer(proposal.id, accepted as CustomerFields);
      const result = { name: before.name, customerId: proposal.id };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_customer_update",
          payload: { jobId, index, id: proposal.id, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (proposal.target === "partner_create") {
      const fields = accepted as unknown as PartnerFields;
      const existing = await prisma.partner.findFirst({
        where: { name: fields.name },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json({ ok: true, name: existing.name, partnerId: existing.id, alreadyExists: true });
      }
      await createPartner({ ...fields, name: fields.name! });
      const created = await prisma.partner.findFirst({
        where: { name: fields.name },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true },
      });
      if (!created) throw new Error("파트너 생성 결과를 확인하지 못했습니다.");
      const result = { name: created.name, partnerId: created.id };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_partner_create",
          payload: { jobId, index, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    if (proposal.target === "partner_update") {
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_partner_update");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });
      const before = await prisma.partner.findUnique({ where: { id: proposal.id }, select: { name: true } });
      if (!before) return NextResponse.json({ error: "지정한 파트너를 찾을 수 없습니다." }, { status: 404 });
      await updatePartner(proposal.id, accepted as PartnerFields);
      const result = { name: before.name, partnerId: proposal.id };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_partner_update",
          payload: { jobId, index, id: proposal.id, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (proposal.target === "expense_create") {
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_expense_create");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });
      const content = accepted as unknown as ExpenseCreateContent;
      const formData = new FormData();
      formData.set("date", `${content.month}-01`);
      formData.set("title", proposal.label!.trim());
      formData.set("category", content.category);
      formData.set("amount", String(content.amount));
      if (content.memo) formData.set("memo", content.memo);
      await addExpense(formData);
      const result = { name: proposal.label!.trim(), month: content.month, category: content.category, amount: content.amount };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_expense_create",
          payload: { jobId, index, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    if (proposal.target === "calendar_create") {
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_calendar_create");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });
      const content = accepted as unknown as CalendarCreateContent;
      await createCalendarEvent({
        title: content.title,
        date: content.date,
        endDate: content.endDate,
        color: content.color ?? "blue",
        projectId: content.projectId,
      });
      const result = { name: content.title, date: content.date, endDate: content.endDate ?? null };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_calendar_create",
          payload: { jobId, index, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    if (proposal.target === "leave_request") {
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_leave_request");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });
      const content = accepted as unknown as LeaveRequestContent;
      const formData = new FormData();
      formData.set("type", content.type);
      formData.set("startDate", content.start);
      formData.set("endDate", content.end);
      if (content.startTime) formData.set("startTime", content.startTime);
      if (content.endTime) formData.set("endTime", content.endTime);
      if (content.reason) formData.set("reason", content.reason);
      await applyLeave(formData);
      const result = { name: proposal.label ?? "휴가 신청", type: content.type, start: content.start, end: content.end };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_leave_request",
          payload: { jobId, index, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    if (proposal.target === "message_send") {
      const existing = await findExistingApplyResult(jobId, index, "assistant_apply_message_send");
      if (existing) return NextResponse.json({ ok: true, ...existing, reused: true });
      const content = accepted as unknown as MessageSendContent;
      const receiver = await prisma.user.findUnique({
        where: { id: content.to },
        select: { id: true, name: true, active: true, isAgent: true, role: true, partnerId: true, customerId: true },
      });
      if (!receiver || !receiver.active || receiver.isAgent || receiver.role === "pending" || receiver.partnerId || receiver.customerId) {
        return NextResponse.json({ error: "파트너·거래처 계정이나 비활성 사용자는 메신저 수신자로 지정할 수 없습니다." }, { status: 403 });
      }
      await sendMessage(receiver.id, content.text);
      const result = { name: receiver.name ?? proposal.label ?? receiver.id, receiverId: receiver.id, text: content.text };
      await prisma.agentAuditLog.create({
        data: {
          method: "POST", endpoint: "/api/assistant/apply", action: "assistant_apply_message_send",
          payload: { jobId, index, changes: JSON.parse(JSON.stringify(proposal.changes)) },
          result: { ...result, by: session.user.id },
        },
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }

    const legacyAccepted = accepted as Record<string, string | number | Date | null>;
    let name: string;
    let moveResult: { name: string; folderPath: string; driveUrl: string } | null = null;
    if (proposal.target === "drive_file") {
      // 파일 ID만 알고 있으면 누구나 다른 파일을 옮길 수 없도록
      // 현재 사용자가 참여한 대화의 첨부파일인지 먼저 확인한다.
      const attachment = await prisma.message.findFirst({
        where: {
          attachmentDriveFileId: proposal.id,
          conversation: {
            OR: [{ participantA: session.user.id }, { participantB: session.user.id }],
          },
        },
        select: { attachmentName: true },
      });
      if (!attachment) {
        return NextResponse.json({ error: "이 첨부파일을 이동할 권한이 없습니다." }, { status: 403 });
      }

      const destination = accepted.destination;
      if (destination === "project") {
        const projectId = typeof accepted.projectId === "string" ? accepted.projectId : "";
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true, createdAt: true },
        });
        if (!project) {
          return NextResponse.json({ error: "지정한 프로젝트를 찾을 수 없습니다." }, { status: 404 });
        }
        const category = typeof accepted.category === "string" ? accepted.category : undefined;
        moveResult = await moveMessengerFileToProject(proposal.id, project, category);
      } else if (destination === "category" && typeof accepted.category === "string") {
        moveResult = await moveMessengerFileToCategory(proposal.id, accepted.category);
      } else {
        return NextResponse.json({ error: "파일을 보낼 폴더가 올바르지 않습니다." }, { status: 400 });
      }
      name = moveResult.name;
    } else if (proposal.target === "venue") {
      const row = await prisma.venue.update({
        where: { id: proposal.id },
        data: legacyAccepted,
        select: { name: true },
      });
      name = row.name;
    } else if (proposal.target === "partner") {
      const row = await prisma.partner.update({
        where: { id: proposal.id },
        data: legacyAccepted,
        select: { name: true },
      });
      name = row.name;
    } else {
      const row = await prisma.project.update({
        where: { id: proposal.id },
        data: legacyAccepted,
        select: { name: true },
      });
      name = row.name;
    }

    // 누가 무엇을 바꿨는지 남긴다. AI 를 거친 변경은 나중에 되짚을 일이 생긴다.
    await prisma.agentAuditLog.create({
      data: {
        method: "POST",
        endpoint: "/api/assistant/apply",
        action: `assistant_apply_${proposal.target}`,
        payload: {
          jobId,
          index,
          id: proposal.id,
          changes: JSON.parse(JSON.stringify(proposal.changes)),
        },
        // Prisma 의 Json 타입은 배열을 그대로 못 받는다. 평범한 값으로 풀어 담는다.
        result: {
          applied: JSON.parse(JSON.stringify(accepted)),
          rejected: rejected.map((r) => `${r.field}: ${r.reason}`),
          by: session.user.id,
          ...(moveResult ? { folderPath: moveResult.folderPath, driveUrl: moveResult.driveUrl } : {}),
        },
      },
    });

    return NextResponse.json({ ok: true, name, applied: accepted, rejected });
  } catch (err) {
    if (err instanceof SheetCreationError) {
      return NextResponse.json({ error: err.message, code: err.code, ...err.details }, { status: err.status });
    }
    // 대상이 이미 지워졌거나 id 가 틀린 경우가 대부분이다.
    console.error("[assistant apply]", err);
    return NextResponse.json(
      { error: "적용하지 못했습니다. 대상이 사라졌거나 값이 맞지 않습니다." },
      { status: 400 },
    );
  }
}
