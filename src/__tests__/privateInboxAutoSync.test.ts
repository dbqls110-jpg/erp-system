import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), access: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { inboxMailbox: { findMany: m.find } } }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.access }));
vi.mock("@/lib/privateMailboxSync", () => ({ syncMailboxForOwner: m.sync }));
import { syncDuePrivateMailboxes } from "@/lib/privateInboxAutoSync";

beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue(true); m.sync.mockResolvedValue({ kind: "synced", imported: 0 }); });
describe("cloud-only private mail receiving", () => {
  it("automatically receives the approved owner's Gmail label and Naver mailbox without a browser session", async () => {
    m.find.mockResolvedValue([{ id: "gmail", ownerId: "owner" }, { id: "naver", ownerId: "owner" }]);
    expect(await syncDuePrivateMailboxes()).toEqual({ checked: 2, synced: 2, skipped: 0, failed: 0 });
    expect(m.access).toHaveBeenCalledWith("owner", "inquiries");
    expect(m.sync.mock.calls.map(call => call[0])).toEqual([
      { id: "gmail", ownerId: "owner", trigger: "automatic" }, { id: "naver", ownerId: "owner", trigger: "automatic" },
    ]);
  });
  it("continues another mailbox after a provider failure and returns no private error or credential", async () => {
    m.find.mockResolvedValue([{ id: "gmail", ownerId: "owner" }, { id: "naver", ownerId: "owner" }]);
    m.sync.mockRejectedValueOnce(Error("private provider token and body"));
    const result = await syncDuePrivateMailboxes();
    expect(result).toEqual({ checked: 2, synced: 1, skipped: 0, failed: 1 });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("does not contact providers after owner permission is revoked", async () => {
    m.find.mockResolvedValue([{ id: "gmail", ownerId: "owner" }]); m.access.mockResolvedValue(false);
    expect(await syncDuePrivateMailboxes()).toEqual({ checked: 1, synced: 0, skipped: 1, failed: 0 });
    expect(m.sync).not.toHaveBeenCalled();
  });
});
