import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const canEditMenu = vi.fn();
  const addChecklistItem = vi.fn();
  const agentJobFindFirst = vi.fn();
  const projectFindUnique = vi.fn();
  const agentAuditLogFindMany = vi.fn();
  const agentAuditLogCreate = vi.fn();

  class SheetCreationError extends Error {
    code = "TEST";
    status = 400;
    details = {};
  }

  return {
    getServerSession,
    canEditMenu,
    addChecklistItem,
    agentJobFindFirst,
    projectFindUnique,
    agentAuditLogFindMany,
    agentAuditLogCreate,
    SheetCreationError,
    prisma: {
      agentJob: { findFirst: agentJobFindFirst },
      project: { findUnique: projectFindUnique },
      agentAuditLog: { findMany: agentAuditLogFindMany, create: agentAuditLogCreate },
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canEditMenu: mocks.canEditMenu }));
vi.mock("@/app/actions/project", () => ({ addChecklistItem: mocks.addChecklistItem }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/googleDrive", () => ({
  moveMessengerFileToCategory: vi.fn(),
  moveMessengerFileToProject: vi.fn(),
}));
vi.mock("@/lib/sheetCreation", () => ({
  createSpreadsheet: vi.fn(),
  SheetCreationError: mocks.SheetCreationError,
}));

import { POST } from "@/app/api/assistant/apply/route";

const jobOutput = [
  "업무를 추가할까요?",
  "```erp-update",
  JSON.stringify({
    target: "project_checklist",
    id: "project-1",
    label: "이상한계절 관광두레",
    items: [" 새 업무 ", "기존 업무", "새 업무", "두번째 업무"],
    reason: "사장님 요청",
  }),
  "```",
].join("\n");

function makeRequest() {
  return new NextRequest("http://localhost/api/assistant/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: "job-1", index: 0 }),
  });
}

describe("POST /api/assistant/apply project_checklist", () => {
  const auditLogs: Array<{ payload: unknown; result: unknown; action: string }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogs.length = 0;
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1", role: "staff" } });
    mocks.agentJobFindFirst.mockResolvedValue({ output: jobOutput, status: "completed" });
    mocks.canEditMenu.mockResolvedValue(true);
    mocks.agentAuditLogFindMany.mockImplementation(async () => auditLogs);
    mocks.agentAuditLogCreate.mockImplementation(async ({ data }: { data: (typeof auditLogs)[number] }) => {
      auditLogs.push(data);
      return data;
    });
    mocks.projectFindUnique.mockResolvedValue({
      name: "이상한계절 관광두레",
      checklistItems: [{ content: "  기존   업무 " }],
    });
    mocks.addChecklistItem.mockResolvedValue({ id: "new-item" });
  });

  it("프로젝트 수정 권한이 없으면 403이고 체크리스트를 쓰지 않는다", async () => {
    mocks.canEditMenu.mockResolvedValue(false);

    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("이 자료를 고칠 권한이 없습니다.");
    expect(mocks.canEditMenu).toHaveBeenCalledWith("user-1", "projects", "staff");
    expect(mocks.addChecklistItem).not.toHaveBeenCalled();
  });

  it("같은 카드를 두 번 적용해도 업무는 한 번만 늘어난다", async () => {
    const firstResponse = await POST(makeRequest());
    const firstPayload = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstPayload).toMatchObject({ addedCount: 2, alreadyExistingCount: 1 });
    expect(mocks.addChecklistItem).toHaveBeenCalledTimes(2);
    expect(mocks.addChecklistItem).toHaveBeenNthCalledWith(1, "project-1", "새 업무");
    expect(mocks.addChecklistItem).toHaveBeenNthCalledWith(2, "project-1", "두번째 업무");

    const secondResponse = await POST(makeRequest());
    const secondPayload = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondPayload).toMatchObject({
      addedCount: 2,
      alreadyExistingCount: 1,
      reused: true,
    });
    expect(mocks.addChecklistItem).toHaveBeenCalledTimes(2);
  });
});
