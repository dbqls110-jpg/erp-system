import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/inquiryNotifications", () => ({ requireInquiryReviewer: mocks.auth }));
import { prisma } from "@/lib/prisma";
import { getPrivateInbox, markPrivateMailRead } from "@/lib/privateInbox";

const enabled = process.env.ERP_CONTACT_DB_TEST === "1";
const prefix = `mail-read-${randomUUID()}`, ownerId = `${prefix}-a`, otherId = `${prefix}-b`;
const mailboxId = `${prefix}-box-a`, otherMailboxId = `${prefix}-box-b`;
const mine = `${prefix}-one`, mineTwo = `${prefix}-two`, other = `${prefix}-other`;
let ready = false;
describe.skipIf(!enabled)("메일 확인 처리 실제 DB · 소유자 경계 · 동시성", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55433" || url.pathname !== "/erp_cost_test") throw Error("Isolated DB required");
    mocks.auth.mockResolvedValue({ id: ownerId });
    await prisma.user.createMany({ data: [ownerId, otherId].map(id => ({ id, name: "격리 메일 검증", email: `${id}@example.invalid` })) });
    ready = true;
    await prisma.inboxMailbox.createMany({ data: [{ id: mailboxId, ownerId }, { id: otherMailboxId, ownerId: otherId }].map(row => ({ ...row, email: `${row.ownerId}@example.invalid`, provider: "naver", folder: "INBOX", encryptedCredential: "fixture-unused-not-a-credential" })) });
    await prisma.inboxMail.createMany({ data: [{ id: mine, mailboxId }, { id: mineTwo, mailboxId }, { id: other, mailboxId: otherMailboxId }].map(row => ({ ...row, providerMessageId: row.id, subject: "가상 광고 메일", senderName: "가상 발신자", senderEmail: "sender@example.invalid", body: "보존할 원문", receivedAt: new Date("2026-11-18T00:00:00Z") })) });
  });
  afterAll(async () => { if (ready) { await prisma.inboxMailbox.deleteMany({ where: { id: { in: [mailboxId, otherMailboxId] } } }); await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } }); } await prisma.$disconnect(); });
  it("광고도 답변 없이 여러 건 확인 처리하며 다른 사람의 메일은 그대로 둔다", async () => {
    await markPrivateMailRead([mine, mineTwo, other]);
    expect(await prisma.inboxMail.findUnique({ where: { id: mine } })).toMatchObject({ body: "보존할 원문", readAt: expect.any(Date) });
    expect(await prisma.inboxMail.findUnique({ where: { id: other } })).toMatchObject({ body: "보존할 원문", readAt: null });
    const data = await getPrivateInbox();
    expect(data.messages.filter(row => [mine, mineTwo].includes(row.id)).every(row => row.readAt !== null)).toBe(true);
    expect(data.messages.some(row => row.id === other)).toBe(false);
  });
  it("같은 메일 8회 동시 확인도 최초 확인 시각과 원문·건수를 유지한다", async () => {
    const before = await prisma.inboxMail.findUniqueOrThrow({ where: { id: mine } });
    await Promise.all(Array.from({ length: 8 }, () => markPrivateMailRead([mine])));
    const after = await prisma.inboxMail.findUniqueOrThrow({ where: { id: mine } });
    expect(after).toEqual(before);
    expect(await prisma.inboxMail.count({ where: { mailboxId } })).toBe(2);
  });
  it("인증 실패 시 다른 메일을 확인 처리하지 않는다", async () => {
    mocks.auth.mockRejectedValue(Error("Forbidden"));
    await expect(markPrivateMailRead([other])).rejects.toThrow("Forbidden");
    expect((await prisma.inboxMail.findUniqueOrThrow({ where: { id: other } })).readAt).toBeNull();
  });
});
