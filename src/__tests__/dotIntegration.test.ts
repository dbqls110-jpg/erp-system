import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOT_ACCOUNT_ID, blocksDotWrite } from "@/lib/dotPolicy";
import { resolveMenuAccess } from "@/lib/menuAccessRules";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
import { verifyDotApiKey, verifyDotSecret, getActiveDotAccount } from "@/lib/dotAuth";
import { parseDotReport, sendDotReport } from "@/lib/dotReports";
import { POST } from "@/app/api/agent/dot/reports/route";
import { GET } from "@/app/api/agent/dot/context/route";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DOT_INTEGRATION_SECRET", "test-only-dot-credential-32-characters"); });
afterEach(() => vi.unstubAllEnvs());
const now = new Date("2026-10-14T01:00:00Z");

describe("DOT 최소 권한", () => {
  it("전용 키만 받고 ERP 공용 키로 대체하지 않는다", () => {
    expect(verifyDotSecret("wrong")).toBe(false);
    expect(verifyDotApiKey(new Request("https://erp.test", { headers: { authorization: "Bearer test-only-dot-credential-32-characters" } }))).toBe(true);
    vi.stubEnv("DOT_INTEGRATION_SECRET", "");
    vi.stubEnv("ERP_AGENT_API_KEY", "test-only-dot-credential-32-characters");
    expect(verifyDotSecret("test-only-dot-credential-32-characters")).toBe(false);
  });
  it("키 없는 조회와 보고는 DB에 접근하지 않는다", async () => {
    expect((await GET(new Request("https://erp.test/api/agent/dot/context"))).status).toBe(401);
    expect((await POST(new Request("https://erp.test/api/agent/dot/reports", { method: "POST" }))).status).toBe(401);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("쓰기용 키를 잘못 재사용한 설정도 거부한다", () => {
    const credential = "test-only-dot-credential-32-characters";
    vi.stubEnv("ERP_AGENT_API_KEY", credential);
    expect(verifyDotSecret(credential)).toBe(false);
    vi.stubEnv("ERP_AGENT_API_KEY", "different-erp-key");
    vi.stubEnv("HERMES_BRIDGE_API_KEY", credential);
    expect(verifyDotSecret(credential)).toBe(false);
  });
  it("비활성화 또는 역할이 바뀐 DOT 계정은 차단한다", async () => {
    db.user.findUnique.mockResolvedValue({ id: DOT_ACCOUNT_ID, role: "admin", active: true, isAgent: true, agentType: "dot" });
    await expect(getActiveDotAccount()).rejects.toMatchObject({ status: 403 });
  });
  it("관리자 설정이 잘못되어도 수정·비밀정보 메뉴는 열리지 않는다", () => {
    expect(resolveMenuAccess("dot", "projects", [{ menuKey: "projects", levelKey: "dot", canView: true, canEdit: true }])).toEqual({ view: true, edit: false });
    expect(resolveMenuAccess("dot", "credentials", [])).toEqual({ view: false, edit: false });
    expect(resolveMenuAccess("dot", "admin", [])).toEqual({ view: false, edit: false });
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect(blocksDotWrite("dot", method)).toBe(true);
    expect(blocksDotWrite("dot", "GET")).toBe(false);
  });
});

describe("DOT 보고 계약", () => {
  it("한국시간 10시와 날짜별 중복 방지를 적용한다", () => {
    const report = parseDotReport({ runId: "run-1", kind: "daily", body: "이상 없음" }, now);
    expect(report.reportKey).toBe("daily:2026-10-14");
    expect(() => parseDotReport({ runId: "run-1", kind: "daily", body: "보고" }, new Date("2026-10-14T00:59:59Z"))).toThrow("오전 10시");
  });
  it("임의 수신자와 발신자·빈 보고를 거부한다", () => {
    expect(() => parseDotReport({ runId: "run-1", kind: "audit", body: "보고", recipientId: "other" }, now)).toThrow("수신자");
    expect(() => parseDotReport({ runId: "run-1", kind: "audit", body: " " }, now)).toThrow("보고 내용");
  });
  it("일일 보고 재전송은 메시지를 추가하지 않는다", async () => {
    const input = parseDotReport({ runId: "run-1", kind: "daily", body: "이상 없음" }, now);
    db.user.findUnique.mockResolvedValueOnce({ id: DOT_ACCOUNT_ID, role: "dot", active: true, isAgent: true, agentType: "dot" })
      .mockResolvedValueOnce({ id: "owner", role: "admin", active: true, isAgent: false });
    const tx = { $executeRaw: vi.fn(), dotReport: { findFirst: vi.fn().mockResolvedValue({ ...input, recipientId: "owner", messageId: "m1" }) }, message: { create: vi.fn() } };
    db.$transaction.mockImplementation((callback) => callback(tx));
    expect(await sendDotReport(input)).toEqual({ messageId: "m1", duplicate: true });
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  function activeAccounts() {
    db.user.findUnique.mockResolvedValueOnce({ id: DOT_ACCOUNT_ID, role: "dot", active: true, isAgent: true, agentType: "dot" })
      .mockResolvedValueOnce({ id: "owner", role: "admin", active: true, isAgent: false });
  }

  it("새 보고는 고정 수신자의 대화에 DOT 발신자로만 저장한다", async () => {
    activeAccounts();
    const tx = {
      $executeRaw: vi.fn(),
      dotReport: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), create: vi.fn() },
      conversation: { upsert: vi.fn().mockResolvedValue({ id: "conversation" }), update: vi.fn() },
      message: { create: vi.fn().mockResolvedValue({ id: "message" }) },
    };
    db.$transaction.mockImplementation(callback => callback(tx));
    expect(await sendDotReport(parseDotReport({ runId: "audit-1", kind: "audit", body: "점검 보고" }, now))).toEqual({ messageId: "message", duplicate: false });
    expect(tx.message.create).toHaveBeenCalledWith({ data: { conversationId: "conversation", senderId: DOT_ACCOUNT_ID, content: expect.stringContaining("점검 보고") } });
    expect(tx.dotReport.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientId: "owner", messageId: "message", runId: "audit-1" }) });
    expect(db.user.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ where: { email: "dbqls110@gmail.com" } }));
  });

  it("이미 보낸 보고의 본문 변경과 일일 전송 한도 초과를 거부한다", async () => {
    const input = parseDotReport({ runId: "audit-1", kind: "audit", body: "보고" }, now);
    const create = vi.fn();
    activeAccounts();
    db.$transaction.mockImplementation(callback => callback({ $executeRaw: vi.fn(), dotReport: { findFirst: vi.fn().mockResolvedValue({ ...input, bodyHash: "different", recipientId: "owner" }) }, message: { create } }));
    await expect(sendDotReport(input)).rejects.toMatchObject({ status: 409 });
    activeAccounts();
    db.$transaction.mockImplementation(callback => callback({ $executeRaw: vi.fn(), dotReport: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(8) }, message: { create } }));
    await expect(sendDotReport(input)).rejects.toMatchObject({ status: 429 });
    expect(create).not.toHaveBeenCalled();
  });

  it("크거나 잘못된 JSON 보고는 메시지를 쓰지 않는다", async () => {
    const headers = { authorization: "Bearer test-only-dot-credential-32-characters", "content-type": "application/json" };
    expect((await POST(new Request("https://erp.test/api/agent/dot/reports", { method: "POST", headers, body: "{" }))).status).toBe(400);
    expect((await POST(new Request("https://erp.test/api/agent/dot/reports", { method: "POST", headers, body: "a".repeat(48001) }))).status).toBe(413);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
