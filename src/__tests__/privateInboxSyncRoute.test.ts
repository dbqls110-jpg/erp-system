import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/privateInboxAutoSync", () => ({ syncDuePrivateMailboxes: m.run }));
import { POST } from "@/app/api/agent/inbox/sync/route";
import { verifyMaintenanceApiKey } from "@/lib/maintenanceAuth";
const fixtureKey = "isolated-inbox-maintenance-key-not-a-real-credential";
const cronFixtureKey = "a".repeat(64);
const cronRequest = (credential: string) => new Request("https://erp.fixture/api/agent/inbox/sync", {
  method: "POST", headers: { "x-erp-inbox-cron": credential },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ERP_MAINTENANCE_SECRET", fixtureKey);
  vi.stubEnv("ERP_PRIVATE_INBOX_CRON_SECRET", undefined);
  m.run.mockResolvedValue({ checked: 2, synced: 2, skipped: 0, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());
describe("background mail reception authentication", () => {
  it("rejects anonymous and wrong keys before any mail lookup", async () => {
    for (const headers of [new Headers(), new Headers({ authorization: "Bearer wrong" })]) expect((await POST(new Request("https://erp.fixture/api/agent/inbox/sync", { method: "POST", headers }))).status).toBe(401);
    expect(m.run).not.toHaveBeenCalled();
  });
  it("uses a maintenance credential without accepting arbitrary owner IDs or returning message data", async () => {
    const response = await POST(new Request("https://erp.fixture/api/agent/inbox/sync", { method: "POST", headers: { authorization: `Bearer ${fixtureKey}` }, body: '{"ownerId":"other-owner"}' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, checked: 2, synced: 2, skipped: 0, failed: 0 });
    expect(m.run).toHaveBeenCalledWith();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("lets the dedicated scheduler run reception without granting general maintenance access", async () => {
    vi.stubEnv("ERP_PRIVATE_INBOX_CRON_SECRET", cronFixtureKey);
    const request = cronRequest(cronFixtureKey);
    expect((await POST(request)).status).toBe(200);
    expect(verifyMaintenanceApiKey(request)).toBe(false);
    expect(verifyMaintenanceApiKey(new Request(request.url, { headers: { authorization: `Bearer ${cronFixtureKey}` } }))).toBe(false);
  });
  it("does not accept a dedicated scheduler request when unconfigured, incorrect, or reusing another service key", async () => {
    expect((await POST(cronRequest(cronFixtureKey))).status).toBe(401);
    vi.stubEnv("ERP_PRIVATE_INBOX_CRON_SECRET", cronFixtureKey);
    expect((await POST(cronRequest("b".repeat(64)))).status).toBe(401);
    vi.stubEnv("ERP_MAINTENANCE_SECRET", cronFixtureKey);
    expect((await POST(cronRequest(cronFixtureKey))).status).toBe(401);
    expect(m.run).not.toHaveBeenCalled();
  });
  it("reports individual connection failures as a retryable failed run without leaking error text", async () => {
    m.run.mockResolvedValue({ checked: 2, synced: 1, skipped: 0, failed: 1 });
    const request = () => new Request("https://erp.fixture/api/agent/inbox/sync", { method: "POST", headers: { authorization: `Bearer ${fixtureKey}` } });
    expect((await POST(request())).status).toBe(503);
    m.run.mockRejectedValue(Error("private credential"));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private credential");
  });
});
