import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn();
  const canEditMenu = vi.fn();
  const canAccessMenu = vi.fn();
  const agentJobFindFirst = vi.fn();
  const agentAuditLogFindMany = vi.fn();
  const agentAuditLogCreate = vi.fn();
  const customerFindFirst = vi.fn();
  const customerFindUnique = vi.fn();
  const partnerFindFirst = vi.fn();
  const partnerFindUnique = vi.fn();
  const userFindUnique = vi.fn();
  const createCustomer = vi.fn();
  const updateCustomer = vi.fn();
  const createPartner = vi.fn();
  const updatePartner = vi.fn();
  const addExpense = vi.fn();
  const createCalendarEvent = vi.fn();
  const applyLeave = vi.fn();
  const sendMessage = vi.fn();
  const getInquiries = vi.fn();
  const getInquiryByIdentity = vi.fn();
  const saveInquiryMemo = vi.fn();
  const saveInquiryStage = vi.fn();
  const getSpaceRegistrations = vi.fn();
  const saveSpaceRegistrationMemo = vi.fn();
  const saveSpaceRegistrationStage = vi.fn();
  const getSpaceRentals = vi.fn();
  const saveSpaceRentalStage = vi.fn();

  return {
    getServerSession,
    canEditMenu,
    canAccessMenu,
    agentJobFindFirst,
    agentAuditLogFindMany,
    agentAuditLogCreate,
    customerFindFirst,
    customerFindUnique,
    partnerFindFirst,
    partnerFindUnique,
    userFindUnique,
    createCustomer,
    updateCustomer,
    createPartner,
    updatePartner,
    addExpense,
    createCalendarEvent,
    applyLeave,
    sendMessage,
    getInquiries,
    getInquiryByIdentity,
    saveInquiryMemo,
    saveInquiryStage,
    getSpaceRegistrations,
    saveSpaceRegistrationMemo,
    saveSpaceRegistrationStage,
    getSpaceRentals,
    saveSpaceRentalStage,
    prisma: {
      agentJob: { findFirst: agentJobFindFirst },
      agentAuditLog: { findMany: agentAuditLogFindMany, create: agentAuditLogCreate },
      customer: { findFirst: customerFindFirst, findUnique: customerFindUnique },
      partner: { findFirst: partnerFindFirst, findUnique: partnerFindUnique },
      user: { findUnique: userFindUnique },
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({
  canEditMenu: mocks.canEditMenu,
  canAccessMenu: mocks.canAccessMenu,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/app/actions/partnerCustomer", () => ({
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  createPartner: mocks.createPartner,
  updatePartner: mocks.updatePartner,
}));
vi.mock("@/app/actions/finance", () => ({ addExpense: mocks.addExpense }));
vi.mock("@/app/actions/calendar", () => ({ createCalendarEvent: mocks.createCalendarEvent }));
vi.mock("@/app/actions/leave", () => ({ applyLeave: mocks.applyLeave }));
vi.mock("@/app/actions/message", () => ({ sendMessage: mocks.sendMessage }));
vi.mock("@/lib/inquirySheet", () => ({
  getInquiries: mocks.getInquiries,
  getInquiryByIdentity: mocks.getInquiryByIdentity,
  saveInquiryMemo: mocks.saveInquiryMemo,
  saveInquiryStage: mocks.saveInquiryStage,
}));
vi.mock("@/lib/spaceRegistrationSheet", () => ({
  getSpaceRegistrations: mocks.getSpaceRegistrations,
  saveSpaceRegistrationMemo: mocks.saveSpaceRegistrationMemo,
  saveSpaceRegistrationStage: mocks.saveSpaceRegistrationStage,
}));
vi.mock("@/lib/spaceRentalSheet", () => ({
  getSpaceRentals: mocks.getSpaceRentals,
  saveSpaceRentalStage: mocks.saveSpaceRentalStage,
}));
vi.mock("@/lib/googleDrive", () => ({
  moveMessengerFileToCategory: vi.fn(),
  moveMessengerFileToProject: vi.fn(),
}));
vi.mock("@/lib/sheetCreation", () => ({
  createSpreadsheet: vi.fn(),
  SheetCreationError: class extends Error {},
}));

import { POST } from "@/app/api/assistant/apply/route";
import { validateProposal, type Proposal } from "@/lib/assistantProposal";

const auditLogs: Array<{ payload: unknown; result: unknown; action: string }> = [];
let output = "";
let input = "";

function fence(value: Record<string, unknown>) {
  return ["```erp-update", JSON.stringify(value), "```"].join("\n");
}

function context(data: Record<string, unknown>) {
  return `지시\n[ERP 자료]\n${JSON.stringify(data)}\n\n[질문]\n질문`;
}

function request() {
  return new NextRequest("http://localhost/api/assistant/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: "job-extended", index: 0 }),
  });
}

const customerInquiry = {
  id: "inq-customer-1",
  identity: { submittedAt: "2026-09-15 09:00", name: "장동진", email: "cj@example.com", phone: "010-0000-0000" },
  name: "장동진",
  memo: "사람이 적은 메모",
};

describe("메신저 추가 제안 검증", () => {
  it.each([
    ["inquiry_move", { target: "inquiry_move", id: "q1", branch: "customer", stage: "검토 중" }],
    ["inquiry_memo", { target: "inquiry_memo", id: "q1", branch: "customer", memo: "" }],
    ["customer_create", { target: "customer_create", fields: { name: "회사", status: "진행" } }],
    ["customer_update", { target: "customer_update", id: "c1", changes: { status: "진행" } }],
    ["partner_create", { target: "partner_create", fields: { name: "김철수", rate: -1 } }],
    ["partner_update", { target: "partner_update", id: "p1", changes: { contractStatus: "만료" } }],
    ["expense_create", { target: "expense_create", label: "임대료", fields: { month: "2026-13", category: "rent", amount: 1 } }],
    ["calendar_create", { target: "calendar_create", label: "회의", fields: { title: "회의", date: "2026-09-31" } }],
    ["leave_request", { target: "leave_request", label: "휴가", fields: { type: "연차", start: "2026-09-22", end: "2026-09-22" } }],
    ["message_send", { target: "message_send", label: "박석영에게", fields: { to: "u1", text: "" } }],
  ])("%s의 잘못된 값은 적용 가능한 값으로 남기지 않는다", (_name, value) => {
    const raw = value as Record<string, unknown>;
    const changes = raw.changes ?? raw.fields ?? Object.fromEntries(
      ["branch", "stage", "memo"].filter((field) => field in raw).map((field) => [field, raw[field]]),
    );
    const result = validateProposal({
      target: raw.target as Proposal["target"],
      id: typeof raw.id === "string" ? raw.id : "",
      label: typeof raw.label === "string" ? raw.label : undefined,
      changes: changes as Record<string, unknown>,
    });
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(Object.keys(result.accepted).length).toBeLessThanOrEqual(2);
  });
});

describe("POST /api/assistant/apply 추가 제안", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditLogs.length = 0;
    output = "";
    input = context({});
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1", role: "member" } });
    mocks.canEditMenu.mockResolvedValue(true);
    mocks.canAccessMenu.mockResolvedValue(true);
    mocks.agentJobFindFirst.mockImplementation(async () => ({ input, output, status: "completed" }));
    mocks.agentAuditLogFindMany.mockImplementation(async () => auditLogs);
    mocks.agentAuditLogCreate.mockImplementation(async ({ data }: { data: (typeof auditLogs)[number] }) => {
      auditLogs.push(data);
      return data;
    });
    mocks.customerFindFirst.mockResolvedValue(null);
    mocks.customerFindUnique.mockResolvedValue({ name: "cj enm" });
    mocks.partnerFindFirst.mockResolvedValue(null);
    mocks.partnerFindUnique.mockResolvedValue({ name: "김철수" });
    mocks.userFindUnique.mockResolvedValue({
      id: "u1", name: "박석영", active: true, isAgent: false, role: "member", partnerId: null, customerId: null,
    });
    mocks.getInquiries.mockResolvedValue([customerInquiry]);
    mocks.getInquiryByIdentity.mockResolvedValue(customerInquiry);
    mocks.saveInquiryStage.mockResolvedValue({ stage: "1차 연락", timestamp: "2026-09-15 10:00" });
    mocks.saveInquiryMemo.mockResolvedValue({ memo: "" });
    mocks.getSpaceRegistrations.mockResolvedValue([]);
    mocks.getSpaceRentals.mockResolvedValue([]);
    mocks.saveSpaceRegistrationStage.mockResolvedValue({ stage: "확인 완료", timestamp: "2026-09-15 10:00" });
    mocks.saveSpaceRegistrationMemo.mockResolvedValue({ memo: "" });
    mocks.saveSpaceRentalStage.mockResolvedValue({ stage: "1차 연락", timestamp: "2026-09-15 10:00" });
  });

  it.each([
    ["inquiry_move", { target: "inquiry_move", id: "inq-customer-1", branch: "customer", stage: "1차 연락" }, { inquiries: { customer: { items: [{ id: "inq-customer-1" }] } } }],
    ["inquiry_memo", { target: "inquiry_memo", id: "inq-customer-1", branch: "customer", memo: "통화함" }, { inquiries: { customer: { items: [{ id: "inq-customer-1" }] } } }],
    ["customer_create", { target: "customer_create", label: "cj enm", fields: { name: "cj enm", category: "고객사" } }, {}],
    ["customer_update", { target: "customer_update", id: "c1", changes: { manager: "장동진" } }, { customers: { items: [{ id: "c1" }] } }],
    ["partner_create", { target: "partner_create", label: "김철수", fields: { name: "김철수", contractStatus: "활성" } }, {}],
    ["partner_update", { target: "partner_update", id: "p1", changes: { phone: "010-1111-2222" } }, { partners: { items: [{ id: "p1" }] } }],
    ["expense_create", { target: "expense_create", label: "9월 임대료", fields: { month: "2026-09", category: "rent", amount: 1500000 } }, {}],
    ["calendar_create", { target: "calendar_create", label: "회의", fields: { title: "회의", date: "2026-09-20" } }, {}],
    ["leave_request", { target: "leave_request", label: "연차 9/22", fields: { type: "annual", start: "2026-09-22", end: "2026-09-22" } }, {}],
    ["message_send", { target: "message_send", label: "박석영에게", fields: { to: "u1", text: "내일 10시 미팅 잊지 마세요" } }, { users: { items: [{ id: "u1", name: "박석영" }] } }],
  ])("%s는 권한이 없으면 403이다", async (_name, value, data) => {
    output = fence(value);
    input = context(data);
    mocks.canEditMenu.mockResolvedValue(false);
    mocks.canAccessMenu.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.canEditMenu.mock.calls.length + mocks.canAccessMenu.mock.calls.length).toBeGreaterThan(0);
  });

  it("inquiry_move는 갈래의 기존 단계 저장 함수를 한 번만 호출한다", async () => {
    output = fence({ target: "inquiry_move", id: customerInquiry.id, branch: "customer", stage: "1차 연락" });
    input = context({ inquiries: { customer: { items: [{ id: customerInquiry.id }] } } });

    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ reused: true });
    expect(mocks.saveInquiryStage).toHaveBeenCalledTimes(1);
  });

  it("inquiry_memo는 기존 메모를 남기고 시각을 붙여 한 번만 저장한다", async () => {
    output = fence({ target: "inquiry_memo", id: customerInquiry.id, branch: "customer", memo: "통화함" });
    input = context({ inquiries: { customer: { items: [{ id: customerInquiry.id }] } } });

    await POST(request());
    await POST(request());

    expect(mocks.saveInquiryMemo).toHaveBeenCalledTimes(1);
    const savedMemo = mocks.saveInquiryMemo.mock.calls[0][1] as string;
    expect(savedMemo).toContain("사람이 적은 메모");
    expect(savedMemo).toContain("통화함");
  });

  it.each([
    ["customer_create", { target: "customer_create", label: "cj enm", fields: { name: "cj enm", category: "고객사" } }, "customer"],
    ["partner_create", { target: "partner_create", label: "김철수", fields: { name: "김철수", contractStatus: "활성" } }, "partner"],
  ])("%s는 같은 이름이면 두 번 눌러도 한 번만 만든다", async (_name, value, model) => {
    let created = false;
    if (model === "customer") {
      mocks.customerFindFirst.mockImplementation(async () => created ? { id: "c1", name: "cj enm" } : null);
      mocks.createCustomer.mockImplementation(async () => { created = true; });
    } else {
      mocks.partnerFindFirst.mockImplementation(async () => created ? { id: "p1", name: "김철수" } : null);
      mocks.createPartner.mockImplementation(async () => { created = true; });
    }
    output = fence(value);

    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(model === "customer" ? mocks.createCustomer : mocks.createPartner).toHaveBeenCalledTimes(1);
    expect(await second.json()).toMatchObject({ alreadyExists: true });
  });

  it.each([
    ["customer_update", { target: "customer_update", id: "c1", changes: { manager: "장동진" } }, "customerUpdate"],
    ["partner_update", { target: "partner_update", id: "p1", changes: { phone: "010-1111-2222" } }, "partnerUpdate"],
    ["expense_create", { target: "expense_create", label: "9월 임대료", fields: { month: "2026-09", category: "rent", amount: 1500000 } }, "expense"],
    ["calendar_create", { target: "calendar_create", label: "회의", fields: { title: "회의", date: "2026-09-20" } }, "calendar"],
    ["leave_request", { target: "leave_request", label: "연차 9/22", fields: { type: "annual", start: "2026-09-22", end: "2026-09-22" } }, "leave"],
    ["message_send", { target: "message_send", label: "박석영에게", fields: { to: "u1", text: "내일 10시 미팅 잊지 마세요" } }, "message"],
  ])("%s는 같은 카드를 두 번 눌러도 기존 액션을 한 번만 부른다", async (_name, value, kind) => {
    output = fence(value);
    input = context(
      kind === "customerUpdate" ? { customers: { items: [{ id: "c1" }] } }
        : kind === "partnerUpdate" ? { partners: { items: [{ id: "p1" }] } }
          : kind === "message" ? { users: { items: [{ id: "u1", name: "박석영" }] } }
            : {},
    );

    const first = await POST(request());
    const second = await POST(request());

    expect([200, 201]).toContain(first.status);
    expect(second.status).toBe(200);
    const action = kind === "customerUpdate" ? mocks.updateCustomer
      : kind === "partnerUpdate" ? mocks.updatePartner
        : kind === "expense" ? mocks.addExpense
          : kind === "calendar" ? mocks.createCalendarEvent
            : kind === "leave" ? mocks.applyLeave
              : mocks.sendMessage;
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("message_send는 ERP 자료에 없는 id와 파트너 계정을 거부한다", async () => {
    output = fence({ target: "message_send", label: "박석영에게", fields: { to: "not-in-context", text: "안내" } });
    input = context({ users: { items: [{ id: "u1", name: "박석영" }] } });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    output = fence({ target: "message_send", label: "파트너에게", fields: { to: "p-user", text: "안내" } });
    input = context({ users: { items: [{ id: "p-user", name: "김파트너" }] } });
    mocks.userFindUnique.mockResolvedValue({
      id: "p-user", name: "김파트너", active: true, isAgent: false, role: "partner", partnerId: "partner-1", customerId: null,
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
