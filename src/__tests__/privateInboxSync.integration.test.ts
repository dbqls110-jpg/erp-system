import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/privateInboxProviders", () => ({ readMailboxMessages: m.read }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.access }));
import { prisma } from "@/lib/prisma";
import { syncDuePrivateMailboxes } from "@/lib/privateInboxAutoSync";
import { syncMailboxForOwner } from "@/lib/privateMailboxSync";

const prefix = `auto-mail-${randomUUID()}`, ownerId = `${prefix}-owner`, otherId = `${prefix}-other`;
const gmail = `${prefix}-gmail`, naver = `${prefix}-naver`, outsideLabel = `${prefix}-outside-label`, foreign = `${prefix}-foreign`;
const ids = [gmail, naver, outsideLabel, foreign];
let ready = false;
const message = () => ({ providerMessageId: "provider-message-one", subject: "가상 수신 자료", senderName: "가상 발신자", senderEmail: "sender@example.invalid", body: "보존할 본문", receivedAt: new Date() });
describe.skipIf(process.env.ERP_INBOX_DB_TEST !== "1")("private inbox automatic reception · actual isolated PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") throw Error("Isolated database required");
    await prisma.user.createMany({ data: [{ id: ownerId, email: "dbqls110@gmail.com", role: "admin" }, { id: otherId, email: `${prefix}@example.invalid`, role: "admin" }] });
    ready = true;
    await prisma.inboxMailbox.createMany({ data: [
      { id: gmail, ownerId, provider: "gmail", email: "dbqls110@gmail.com", folder: "ERP문의" },
      { id: naver, ownerId, provider: "naver", email: "fixture@naver.com", folder: "INBOX" },
      { id: outsideLabel, ownerId, provider: "gmail", email: "other-label@example.invalid", folder: "INBOX" },
      { id: foreign, ownerId: otherId, provider: "naver", email: "foreign@naver.com", folder: "INBOX" },
    ].map(row => ({ ...row, encryptedCredential: "fixture-not-a-real-credential" })) });
  });
  beforeEach(async () => {
    vi.clearAllMocks(); m.access.mockResolvedValue(true);
    m.read.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return [message()]; });
    await prisma.user.update({ where: { id: ownerId }, data: { active: true } });
    await prisma.inboxFollowUp.deleteMany({ where: { ownerId } });
    await prisma.inboxMail.deleteMany({ where: { mailboxId: { in: ids } } });
    await prisma.inboxMailbox.updateMany({ where: { id: { in: ids } }, data: { lastSyncedAt: null, lastErrorCode: null, leaseToken: null, leaseUntil: null, encryptedCredential: "fixture-not-a-real-credential" } });
  });
  afterAll(async () => {
    if (ready) { await prisma.inboxFollowUp.deleteMany({ where: { ownerId } }); await prisma.inboxMailbox.deleteMany({ where: { id: { in: ids } } }); await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } }); }
    await prisma.$disconnect();
  });
  it("receives only the approved label and owner, never the Gmail inbox or another owner", async () => {
    expect(await syncDuePrivateMailboxes()).toEqual({ checked: 2, synced: 2, skipped: 0, failed: 0 });
    expect(await prisma.inboxMail.count({ where: { mailboxId: { in: [gmail, naver] } } })).toBe(2);
    expect(await prisma.inboxMail.count({ where: { mailboxId: { in: [outsideLabel, foreign] } } })).toBe(0);
    expect((await prisma.inboxMailbox.findUniqueOrThrow({ where: { id: outsideLabel } })).lastSyncedAt).toBeNull();
  });
  it("eight background runs plus manual receiving contact each provider once and preserve read state on the next poll", async () => {
    await Promise.all([...Array.from({ length: 8 }, () => syncDuePrivateMailboxes()), syncMailboxForOwner({ id: gmail, ownerId, trigger: "manual" })]);
    expect(m.read).toHaveBeenCalledTimes(2);
    const first = await prisma.inboxMail.findFirstOrThrow({ where: { mailboxId: gmail } });
    const readAt = new Date(); await prisma.inboxMail.update({ where: { id: first.id }, data: { readAt } });
    await prisma.inboxMailbox.updateMany({ where: { id: { in: [gmail, naver] } }, data: { lastSyncedAt: new Date(Date.now() - 10 * 60_000) } });
    await syncDuePrivateMailboxes();
    expect(await prisma.inboxMail.count({ where: { mailboxId: { in: [gmail, naver] } } })).toBe(2);
    expect(await prisma.inboxMail.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ readAt, body: "보존할 본문" });
  });
  it("does not poll recent successes or authentication failures too frequently", async () => {
    await prisma.inboxMailbox.update({ where: { id: gmail }, data: { lastSyncedAt: new Date(Date.now() - 20 * 60_000), lastErrorCode: "reauthorize" } });
    await prisma.inboxMailbox.update({ where: { id: naver }, data: { lastSyncedAt: new Date(Date.now() - 3 * 60_000) } });
    expect((await syncDuePrivateMailboxes()).checked).toBe(0); expect(m.read).not.toHaveBeenCalled();
    await prisma.inboxMailbox.update({ where: { id: naver }, data: { lastSyncedAt: new Date(Date.now() - 4.5 * 60_000), lastErrorCode: "connection_timeout" } });
    expect((await syncDuePrivateMailboxes()).synced).toBe(1);
  });
  it("automatic receiving does not delete saved older mail or its follow-up", async () => {
    const old = await prisma.inboxMail.create({ data: { ...message(), providerMessageId: "older-saved-mail", mailboxId: gmail, receivedAt: new Date(Date.now() - 45 * 86400_000) } });
    await prisma.inboxFollowUp.create({ data: { ownerId, itemKey: `mail:${old.id}`, note: "보존할 다음 연락", dueAt: new Date(Date.now() + 86400_000) } });
    await syncDuePrivateMailboxes();
    expect(await prisma.inboxMail.findUnique({ where: { id: old.id } })).not.toBeNull();
    expect(await prisma.inboxFollowUp.count({ where: { ownerId, itemKey: `mail:${old.id}` } })).toBe(1);
  });
  it("one provider error does not block the other account and stores only a safe error code", async () => {
    m.read.mockImplementation(async (account: { id: string }) => { if (account.id === gmail) throw Object.assign(Error("private provider diagnostics"), { code: "ETIMEDOUT" }); return [message()]; });
    expect(await syncDuePrivateMailboxes()).toEqual({ checked: 2, synced: 1, skipped: 0, failed: 1 });
    expect(await prisma.inboxMailbox.findUniqueOrThrow({ where: { id: gmail } })).toMatchObject({ lastErrorCode: "connection_timeout", leaseToken: null });
    expect(await prisma.inboxMail.count({ where: { mailboxId: naver } })).toBe(1);
  });
  it("disabling the owner or revoking inquiry access stops background receiving", async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { active: false } });
    expect((await syncDuePrivateMailboxes()).checked).toBe(0); expect(m.read).not.toHaveBeenCalled();
    await prisma.user.update({ where: { id: ownerId }, data: { active: true } }); m.access.mockResolvedValue(false);
    expect((await syncDuePrivateMailboxes()).skipped).toBe(2); expect(m.read).not.toHaveBeenCalled();
  });
  it("a reconnect during provider reading discards the old credential's response", async () => {
    m.read.mockImplementation(async () => { await prisma.inboxMailbox.update({ where: { id: gmail }, data: { encryptedCredential: "reconnected-fixture", leaseToken: null, leaseUntil: null } }); return [message()]; });
    expect(await syncMailboxForOwner({ id: gmail, ownerId, trigger: "automatic" })).toEqual({ kind: "skipped" });
    expect(await prisma.inboxMail.count({ where: { mailboxId: gmail } })).toBe(0);
  });
  it("owner deactivation while reading prevents a late save and releases the lease", async () => {
    m.read.mockImplementation(async () => { await prisma.user.update({ where: { id: ownerId }, data: { active: false } }); return [message()]; });
    expect(await syncMailboxForOwner({ id: gmail, ownerId, trigger: "automatic" })).toEqual({ kind: "skipped" });
    expect(await prisma.inboxMail.count({ where: { mailboxId: gmail } })).toBe(0);
    expect((await prisma.inboxMailbox.findUniqueOrThrow({ where: { id: gmail } })).leaseToken).toBeNull();
  });
});
