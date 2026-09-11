import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const canEditMenu = vi.fn();
  const createProject = vi.fn();
  const setChecklistDone = vi.fn();
  const createProjectAmount = vi.fn();
  const agentJobFindFirst = vi.fn();
  const projectFindFirst = vi.fn();
  const projectFindUnique = vi.fn();
  const agentAuditLogFindMany = vi.fn();
  const agentAuditLogCreate = vi.fn();

  return {
    getServerSession,
    canEditMenu,
    createProject,
    setChecklistDone,
    createProjectAmount,
    agentJobFindFirst,
    projectFindFirst,
    projectFindUnique,
    agentAuditLogFindMany,
    agentAuditLogCreate,
    prisma: {
      agentJob: { findFirst: agentJobFindFirst },
      project: { findFirst: projectFindFirst, findUnique: projectFindUnique },
      agentAuditLog: { findMany: agentAuditLogFindMany, create: agentAuditLogCreate },
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canEditMenu: mocks.canEditMenu }));
vi.mock("@/app/actions/project", () => ({
  addChecklistItem: vi.fn(),
  createProject: mocks.createProject,
  setChecklistDone: mocks.setChecklistDone,
}));
vi.mock("@/app/actions/projectAmount", () => ({ createProjectAmount: mocks.createProjectAmount }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/googleDrive", () => ({
  moveMessengerFileToCategory: vi.fn(),
  moveMessengerFileToProject: vi.fn(),
}));
vi.mock("@/lib/sheetCreation", () => ({
  createSpreadsheet: vi.fn(),
  SheetCreationError: class extends Error {},
}));

import { POST } from "@/app/api/assistant/apply/route";

const auditLogs: Array<{ payload: unknown; result: unknown; action: string }> = [];
let output = "";
let projectTotals = { revenue: 0, cost: 0 };

function makeRequest() {
  return new NextRequest("http://localhost/api/assistant/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: "job-1", index: 0 }),
  });
}

function proposal(value: Record<string, unknown>) {
  return ["확인 카드입니다.", "```erp-update", JSON.stringify(value), "```"].join("\n");
}

describe("메신저 프로젝트 제안 적용", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditLogs.length = 0;
    output = "";
    projectTotals = { revenue: 0, cost: 0 };
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1", role: "staff" } });
    mocks.canEditMenu.mockResolvedValue(true);
    mocks.agentJobFindFirst.mockImplementation(async () => ({ output, status: "completed" }));
    mocks.agentAuditLogFindMany.mockImplementation(async () => auditLogs);
    mocks.agentAuditLogCreate.mockImplementation(async ({ data }: { data: (typeof auditLogs)[number] }) => {
      auditLogs.push(data);
      return data;
    });
    mocks.projectFindFirst.mockResolvedValue(null);
    mocks.projectFindUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => {
      if (select.checklistItems) {
        return {
          name: "이상한계절 관광두레",
          checklistItems: [
            { id: "item-namecard", content: "  명 함  " },
            { id: "item-bag", content: "종이백" },
          ],
        };
      }
      if (select.revenue) {
        return { name: "이상한계절 관광두레", ...projectTotals };
      }
      return { name: "이상한계절 관광두레" };
    });
    mocks.createProject.mockResolvedValue({ projectId: "project-new" });
    mocks.setChecklistDone.mockResolvedValue(undefined);
    mocks.createProjectAmount.mockImplementation(async (_projectId: string, entry: { kind: string; amount: number }) => {
      if (entry.kind === "revenue") projectTotals.revenue += entry.amount;
      if (entry.kind === "cost") projectTotals.cost += entry.amount;
      return { id: `amount-${entry.kind}` };
    });
  });

  it("project_create은 고객사 이름을 company로 받지 않는다", async () => {
    output = proposal({
      target: "project_create",
      label: "새 프로젝트",
      fields: { name: "새 행사", company: "cj enm" },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("같은 이름의 프로젝트가 있으면 만들지 않고 이미 있음으로 돌린다", async () => {
    output = proposal({
      target: "project_create",
      fields: { name: "이미 있는 행사", client: "고객사" },
    });
    mocks.projectFindFirst.mockResolvedValue({ id: "project-existing", name: "이미 있는 행사" });

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ alreadyExists: true, projectId: "project-existing" });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("checklist_done은 공백·대소문자를 무시하고 없는 업무는 건너뛰며 해제를 고정한다", async () => {
    output = proposal({
      target: "checklist_done",
      id: "project-1",
      label: "이상한계절 관광두레",
      items: [" 명함", "종 이 백", "없는 업무"],
      done: false,
    });

    const firstResponse = await POST(makeRequest());
    const firstPayload = await firstResponse.json();
    const secondResponse = await POST(makeRequest());
    const secondPayload = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstPayload).toMatchObject({ foundCount: 2, notFoundCount: 1, done: false });
    expect(secondPayload).toMatchObject({ foundCount: 2, notFoundCount: 1, done: false, reused: true });
    expect(mocks.setChecklistDone).toHaveBeenCalledTimes(2);
    expect(mocks.setChecklistDone).toHaveBeenNthCalledWith(1, "item-namecard", "project-1", false);
    expect(mocks.setChecklistDone).toHaveBeenNthCalledWith(2, "item-bag", "project-1", false);
  });

  it("project_amount은 0·음수를 거부하고 적용 뒤 합계를 돌려주며 두 번 만들지 않는다", async () => {
    output = proposal({
      target: "project_amount",
      id: "project-1",
      entries: [
        { kind: "cost", amount: 0, label: "잘못된 금액" },
        { kind: "revenue", amount: -1, label: "잘못된 금액" },
      ],
    });
    const rejectedResponse = await POST(makeRequest());
    expect(rejectedResponse.status).toBe(400);
    expect(mocks.createProjectAmount).not.toHaveBeenCalled();

    output = proposal({
      target: "project_amount",
      id: "project-1",
      entries: [
        { kind: "cost", amount: 300000, label: "추가 매입", memo: "현수막" },
        { kind: "revenue", amount: 500000, label: "추가 매출" },
      ],
    });
    const firstResponse = await POST(makeRequest());
    const firstPayload = await firstResponse.json();
    const secondResponse = await POST(makeRequest());
    const secondPayload = await secondResponse.json();

    expect(firstPayload).toMatchObject({ revenue: 500000, cost: 300000, entryCount: 2 });
    expect(secondPayload).toMatchObject({ revenue: 500000, cost: 300000, entryCount: 2, reused: true });
    expect(mocks.createProjectAmount).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["project_create", { target: "project_create", fields: { name: "새 행사" } }],
    ["checklist_done", { target: "checklist_done", id: "project-1", items: ["명함"], done: true }],
    ["project_amount", { target: "project_amount", id: "project-1", entries: [{ kind: "cost", amount: 100 }] }],
  ])("%s은 프로젝트 수정 권한이 없으면 403이다", async (_name, value) => {
    output = proposal(value);
    mocks.canEditMenu.mockResolvedValue(false);

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    expect(mocks.canEditMenu).toHaveBeenCalledWith("user-1", "projects", "staff");
  });
});
