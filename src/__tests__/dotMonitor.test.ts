import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { checkDotMissingReport } from "@/lib/dotMonitor";
import { verifyMaintenanceApiKey } from "@/lib/maintenanceAuth";

function txFixture(received = false, alerted = false) {
  return { $executeRaw: vi.fn(), dotReport: { findFirst: vi.fn().mockResolvedValue(received ? { id: "daily" } : null) },
    dotMonitorAlert: { findUnique: vi.fn().mockResolvedValue(alerted ? { date: "2026-10-15" } : null), create: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValueOnce({ id: "owner", active: true, isAgent: false }).mockResolvedValueOnce({ id: "dot" }) },
    conversation: { upsert: vi.fn().mockResolvedValue({ id: "conv" }), update: vi.fn() }, message: { create: vi.fn().mockResolvedValue({ id: "message" }) } };
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DOT_MONITOR_ENABLED", "true"); vi.stubEnv("DOT_MONITOR_START_DATE", "2026-10-15"); });
afterEach(() => vi.unstubAllEnvs());
describe("DOT 보고 누락 감시", () => {
  it("실제 시작 전과 감시 비활성 상태에서는 DB를 깨우지 않는다", async () => {
    expect(await checkDotMissingReport(new Date("2026-10-14T03:00:00Z"))).toEqual({ status: "disabled" });
    vi.stubEnv("DOT_MONITOR_ENABLED", "false");
    expect(await checkDotMissingReport()).toEqual({ status: "disabled" }); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("한국시간 10:15 이전에는 알리지 않는다", async () => {
    expect(await checkDotMissingReport(new Date("2026-10-15T01:14:59Z"))).toEqual({ status: "waiting" }); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([[true, false, "received"], [false, true, "already_notified"]])("보고·알림이 이미 있으면 중복 발송하지 않는다", async (received, alerted, status) => {
    const tx = txFixture(Boolean(received), Boolean(alerted)); db.$transaction.mockImplementation(callback => callback(tx));
    expect(await checkDotMissingReport(new Date("2026-10-15T01:15:00Z"))).toEqual({ status }); expect(tx.message.create).not.toHaveBeenCalled();
  });
  it("당일 보고가 없으면 고정 소유자에게 시스템 알림과 멱등 기록을 함께 저장한다", async () => {
    const tx = txFixture(); db.$transaction.mockImplementation(callback => callback(tx));
    expect(await checkDotMissingReport(new Date("2026-10-15T01:15:00Z"))).toEqual({ status: "notified" });
    expect(tx.dotMonitorAlert.create).toHaveBeenCalledWith({ data: { date: "2026-10-15", messageId: "message" } });
    expect(tx.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({ content: expect.stringContaining("시스템 · DOT 보고 누락") }) });
  });
  it("감시 키는 공용·DOT 키와 달라야 하며 무인증 요청은 거부한다", () => {
    vi.stubEnv("ERP_MAINTENANCE_SECRET", "test-maintenance-credential-32-characters");
    const req = new Request("https://erp.test", { headers: { authorization: "Bearer test-maintenance-credential-32-characters" } });
    expect(verifyMaintenanceApiKey(req)).toBe(true);
    vi.stubEnv("DOT_INTEGRATION_SECRET", "test-maintenance-credential-32-characters"); expect(verifyMaintenanceApiKey(req)).toBe(false);
    expect(verifyMaintenanceApiKey(new Request("https://erp.test"))).toBe(false);
  });
});
