import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ labels: vi.fn(), list: vi.fn(), get: vi.fn() }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class { setCredentials() {} } }, gmail: () => ({ users: { labels: { list: m.labels }, messages: { list: m.list, get: m.get } } }) } }));
vi.mock("@/lib/googleClient", () => ({ decryptFromStorage: () => "fixture-only-not-real" }));
import { readMailboxMessages } from "@/lib/privateInboxProviders";
const account = { provider: "gmail", email: "owner@example.invalid", folder: "ERP문의", encryptedCredential: "fixture-unused" };
beforeEach(() => {
  vi.clearAllMocks(); m.labels.mockResolvedValue({ data: { labels: [{ name: "ERP문의", id: "label-erp" }, { name: "INBOX", id: "INBOX" }] } });
  m.list.mockResolvedValue({ data: { messages: [{ id: "labeled" }, { id: "not-labeled-anymore" }] } });
  m.get.mockImplementation(async ({ id }: { id: string }) => ({ data: { id, internalDate: String(Date.now()), labelIds: id === "labeled" ? ["label-erp"] : ["INBOX"], payload: { mimeType: "text/plain", headers: [{ name: "Subject", value: "가상 문의" }, { name: "From", value: "Fixture <sender@example.invalid>" }], body: { data: Buffer.from("안녕하세요").toString("base64url") } } } }));
});
describe("Gmail import remains label-only", () => {
  it("requests only ERP문의 and rejects mail whose label was removed during retrieval", async () => {
    const result = await readMailboxMessages(account);
    expect(m.list.mock.calls[0][0]).toEqual({ userId: "me", labelIds: ["label-erp"], q: "newer_than:30d", maxResults: 40, includeSpamTrash: false });
    expect(result.map(row => row.providerMessageId)).toEqual(["labeled"]);
    expect(result[0].body).toBe("안녕하세요");
  });
  it("never falls back to the inbox when the selected label is missing", async () => {
    m.labels.mockResolvedValue({ data: { labels: [{ name: "INBOX", id: "INBOX" }] } });
    await expect(readMailboxMessages(account)).rejects.toThrow("mailbox_label_missing");
    expect(m.list).not.toHaveBeenCalled();
  });
  it("does not download the body of a message already stored in ERP", async () => {
    m.list.mockResolvedValue({ data: { messages: [{ id: "labeled" }] } });
    expect(await readMailboxMessages(account, new Set(["labeled"]))).toEqual([]);
    expect(m.get).not.toHaveBeenCalled();
  });
});
