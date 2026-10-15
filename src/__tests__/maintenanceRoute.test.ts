import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ monitor: vi.fn(), recover: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/dotMonitor", () => ({ checkDotMissingReport: calls.monitor }));
vi.mock("@/lib/projectUploadRecovery", () => ({ recoverProjectUploads: calls.recover }));
vi.mock("next/cache", () => ({ revalidatePath: calls.revalidate }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("ERP_MAINTENANCE_SECRET", "test-maintenance-credential-32-characters"); calls.monitor.mockResolvedValue({ status: "disabled" }); calls.recover.mockResolvedValue({ recovered: 0, checked: 0 }); });
afterEach(() => vi.unstubAllEnvs());
const request = () => new Request("https://erp.test/api/agent/maintenance", { method: "POST", headers: { authorization: "Bearer test-maintenance-credential-32-characters" } });
describe("클라우드 유지보수 호출", () => {
  it("인증 없는 호출은 감시·복구를 실행하지 않는다", async () => {
    const { POST } = await import("@/app/api/agent/maintenance/route");
    expect((await POST(new Request("https://erp.test", { method: "POST" }))).status).toBe(401);
    expect(calls.monitor).not.toHaveBeenCalled(); expect(calls.recover).not.toHaveBeenCalled();
  });
  it("허용된 호출만 실행하고 분당 재호출을 제한한다", async () => {
    const { POST } = await import("@/app/api/agent/maintenance/route");
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(429); expect(calls.recover).toHaveBeenCalledTimes(1);
  });
  it("한 작업이 실패해도 나머지 작업은 실행하고 스케줄러에 실패를 알린다", async () => {
    calls.monitor.mockRejectedValue(new Error("private failure details"));
    const { POST } = await import("@/app/api/agent/maintenance/route");
    const response = await POST(request()); expect(response.status).toBe(503);
    expect(calls.recover).toHaveBeenCalled(); expect(await response.text()).not.toContain("private failure");
  });
});
