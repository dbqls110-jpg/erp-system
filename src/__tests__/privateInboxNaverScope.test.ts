import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ validity: BigInt(88), fetchAll: vi.fn(), fetchOne: vi.fn(), lock: vi.fn() }));
vi.mock("@/lib/googleClient", () => ({ decryptFromStorage: () => "fixture-only-not-real" }));
vi.mock("imapflow", () => ({ ImapFlow: class {
  mailbox = { uidValidity: m.validity };
  on() {} async connect() {} close() {}
  getMailboxLock = m.lock;
  async search() { return [1, 2]; }
  fetchAll = m.fetchAll;
  fetchOne = m.fetchOne;
} }));
import { readMailboxMessages } from "@/lib/privateInboxProviders";
const account = { provider: "naver", email: "fixture@naver.com", folder: "INBOX", encryptedCredential: "fixture-unused" };
beforeEach(() => {
  vi.clearAllMocks(); m.validity = BigInt(88);
  m.lock.mockImplementation(async (folder: string, options: { readOnly?: boolean }) => { if (folder !== "INBOX" || options.readOnly !== true) throw Error("Mailbox must be opened read-only"); return { release() {} }; });
  m.fetchAll.mockImplementation(async (ids: number[]) => ids.map(uid => ({ uid, size: 150, internalDate: new Date() })));
  m.fetchOne.mockImplementation(async (uid: number) => ({ uid, source: Buffer.from("From: Fixture <sender@example.invalid>\r\nSubject: Fixture\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello"), internalDate: new Date() }));
});
describe("Naver background receiving remains read-only and incremental", () => {
  it("downloads only the newly found UID and does not download already saved bodies", async () => {
    const rows = await readMailboxMessages(account, new Set(["88:1"]));
    expect(rows.map(row => row.providerMessageId)).toEqual(["88:2"]);
    expect(m.fetchOne.mock.calls.map(call => call[0])).toEqual([2]);
  });
  it("does no body download or metadata fetch when the current candidates are already saved", async () => {
    expect(await readMailboxMessages(account, new Set(["88:1", "88:2"]))).toEqual([]);
    expect(m.fetchAll).not.toHaveBeenCalled(); expect(m.fetchOne).not.toHaveBeenCalled();
  });
  it("does not mistake reused IMAP UIDs after a UIDVALIDITY change for already saved mail", async () => {
    m.validity = BigInt(89);
    expect((await readMailboxMessages(account, new Set(["88:1", "88:2"]))).map(row => row.providerMessageId).sort()).toEqual(["89:1", "89:2"]);
  });
});
