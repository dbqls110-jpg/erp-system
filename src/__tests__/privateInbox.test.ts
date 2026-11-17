import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), snapshot: vi.fn(),
  mailbox: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  mail: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  follow: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  read: vi.fn(), verify: vi.fn(), encrypt: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const db = { inboxMailbox: mocks.mailbox, inboxMail: mocks.mail, inboxFollowUp: mocks.follow };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
vi.mock("@/lib/inquiryNotifications", () => ({ requireInquiryReviewer: mocks.auth, getInquiryNotificationSnapshot: mocks.snapshot }));
vi.mock("@/lib/googleClient", () => ({ encryptForStorage: mocks.encrypt }));
vi.mock("@/lib/privateInboxProviders", () => ({ readMailboxMessages: mocks.read, verifyNaverMailbox: mocks.verify }));
import { getPrivateInbox, saveInboxFollowUp, syncPrivateMailbox, disconnectMailbox, storePrivateMailbox } from "@/lib/privateInbox";

beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "owner-a" });
  mocks.mailbox.findMany.mockResolvedValue([]); mocks.mail.findMany.mockResolvedValue([]); mocks.follow.findMany.mockResolvedValue([]);
});
describe("통합 문의함 소유자 경계 · 서비스 단위 검증", () => {
  it("인증 실패 시 메일 DB를 읽지 않는다", async () => {
    mocks.auth.mockRejectedValue(Error("Forbidden"));
    await expect(getPrivateInbox()).rejects.toThrow("Forbidden");
    expect(mocks.mail.findMany).not.toHaveBeenCalled();
  });
  it("메일 조회는 모든 쿼리에 본인 조건이 있고 비밀 필드를 반환하지 않는다", async () => {
    await expect(getPrivateInbox()).resolves.toEqual({ mailboxes: [], messages: [], followUps: [] });
    expect(mocks.mailbox.findMany.mock.calls[0][0].where).toEqual({ ownerId: "owner-a" });
    expect(mocks.mailbox.findMany.mock.calls[0][0].select).not.toHaveProperty("encryptedCredential");
    expect(mocks.mail.findMany.mock.calls[0][0].where).toEqual({ mailbox: { ownerId: "owner-a" } });
    expect(mocks.follow.findMany.mock.calls[0][0].where).toEqual({ ownerId: "owner-a" });
  });
  it("남의 메일 ID에 연락 일정을 저장하지 못한다", async () => {
    mocks.mail.findFirst.mockResolvedValue(null);
    await expect(saveInboxFollowUp({ itemKey: "mail:other", dueAt: "2026-11-13T10:00", note: "", version: 0 })).rejects.toThrow("접근");
    expect(mocks.mail.findFirst.mock.calls[0][0].where.mailbox).toEqual({ ownerId: "owner-a" });
    expect(mocks.follow.create).not.toHaveBeenCalled();
  });
  it("수정 버전이 바뀐 연락 일정은 덮어쓰지 않는다", async () => {
    mocks.mail.findFirst.mockResolvedValue({ id: "mine" }); mocks.follow.updateMany.mockResolvedValue({ count: 0 });
    await expect(saveInboxFollowUp({ itemKey: "mail:mine", dueAt: "", note: "", version: 3 })).rejects.toThrow("다른 화면");
    expect(mocks.follow.updateMany.mock.calls[0][0].where).toEqual({ ownerId: "owner-a", itemKey: "mail:mine", version: 3 });
  });
  it("남의 메일 연결을 해제하지 못한다", async () => {
    mocks.mailbox.findFirst.mockResolvedValue(null);
    await expect(disconnectMailbox("other")).rejects.toThrow("찾을 수");
    expect(mocks.mailbox.delete).not.toHaveBeenCalled();
  });
  it("동시 실행·쿨다운은 외부 메일 서버를 중복 조회하지 않는다", async () => {
    mocks.mailbox.updateMany.mockResolvedValue({ count: 0 });
    await syncPrivateMailbox("mailbox-a");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.mailbox.updateMany.mock.calls[0][0].where.ownerId).toBe("owner-a");
  });
  it("라벨을 바꾸면 이전 범위 메일 사본과 연락 일정은 제거하고 리스를 무효화한다", async () => {
    mocks.mailbox.findUnique.mockResolvedValue({ id: "a1", folder: "old" }); mocks.mail.findMany.mockResolvedValue([{ id: "m1" }]);
    await storePrivateMailbox({ ownerId: "owner-a", provider: "gmail", email: "a@example.com", folder: "new", encryptedCredential: "encrypted" });
    expect(mocks.mail.deleteMany).toHaveBeenCalledWith({ where: { mailboxId: "a1" } });
    expect(mocks.follow.deleteMany.mock.calls[0][0].where).toEqual({ ownerId: "owner-a", itemKey: { in: ["mail:m1"] } });
    expect(mocks.mailbox.upsert.mock.calls[0][0].update).toMatchObject({ leaseToken: null, leaseUntil: null });
  });
});
