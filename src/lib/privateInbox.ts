import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireInquiryReviewer, getInquiryNotificationSnapshot } from "@/lib/inquiryNotifications";
import { inquiryKey } from "@/lib/inquiryNotificationKeys";
import { encryptForStorage } from "@/lib/googleClient";
import { readMailboxMessages, verifyNaverMailbox } from "@/lib/privateInboxProviders";
import { parseFollowUpDate, parseMailboxFolder, parseNaverEmail, type PrivateInboxView } from "@/lib/privateInboxPolicy";

const mailboxSelect = { id: true, provider: true, email: true, folder: true, lastSyncedAt: true, lastErrorCode: true };

export async function storePrivateMailbox(input: { ownerId: string; provider: "gmail" | "naver"; email: string; folder: string; encryptedCredential: string }) {
  return prisma.$transaction(async tx => {
    const where = { ownerId_provider_email: { ownerId: input.ownerId, provider: input.provider, email: input.email } };
    const existing = await tx.inboxMailbox.findUnique({ where, select: { id: true, folder: true } });
    if (!existing && await tx.inboxMailbox.count({ where: { ownerId: input.ownerId } }) >= 10) throw Error("메일은 최대 10개까지 연결할 수 있습니다.");
    if (existing && existing.folder !== input.folder) {
      const old = await tx.inboxMail.findMany({ where: { mailboxId: existing.id }, select: { id: true } });
      await tx.inboxFollowUp.deleteMany({ where: { ownerId: input.ownerId, itemKey: { in: old.map(row => `mail:${row.id}`) } } });
      await tx.inboxMail.deleteMany({ where: { mailboxId: existing.id } });
    }
    return tx.inboxMailbox.upsert({ where, create: input, update: { folder: input.folder, encryptedCredential: input.encryptedCredential, lastErrorCode: null, lastSyncedAt: null, leaseToken: null, leaseUntil: null } });
  });
}

export async function getPrivateInbox(): Promise<PrivateInboxView> {
  const user = await requireInquiryReviewer();
  const [mailboxes, messages, followUps] = await Promise.all([
    prisma.inboxMailbox.findMany({ where: { ownerId: user.id }, select: mailboxSelect, orderBy: { createdAt: "asc" } }),
    prisma.inboxMail.findMany({ where: { mailbox: { ownerId: user.id } }, take: 200, orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
      select: { id: true, mailboxId: true, subject: true, senderName: true, senderEmail: true, body: true, receivedAt: true, mailbox: { select: { provider: true, email: true } } } }),
    prisma.inboxFollowUp.findMany({ where: { ownerId: user.id }, select: { itemKey: true, dueAt: true, note: true, version: true } }),
  ]);
  return {
    mailboxes: mailboxes.map(row => ({ ...row, lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null })),
    messages: messages.map(({ mailbox, ...row }) => ({ ...row, provider: mailbox.provider, accountEmail: mailbox.email, receivedAt: row.receivedAt.toISOString() })),
    followUps: followUps.map(row => ({ ...row, dueAt: row.dueAt?.toISOString() ?? null })),
  };
}

export async function connectNaverMailbox(input: { email: unknown; folder: unknown; password: unknown }) {
  const user = await requireInquiryReviewer();
  const email = parseNaverEmail(input.email), folder = parseMailboxFolder(input.folder);
  if (typeof input.password !== "string" || input.password.length < 8 || input.password.length > 100 || /[\r\n]/.test(input.password)) throw Error("네이버 앱 비밀번호를 입력해 주세요.");
  if (await prisma.inboxMailbox.count({ where: { ownerId: user.id } }) >= 10) throw Error("메일은 최대 10개까지 연결할 수 있습니다.");
  // 암호화 설정 오류라면 비밀번호를 외부로 보내기 전에 실패한다.
  const encryptedCredential = encryptForStorage(input.password);
  await verifyNaverMailbox(email, input.password, folder);
  await storePrivateMailbox({ ownerId: user.id, provider: "naver", email, folder, encryptedCredential });
}

export async function disconnectMailbox(id: string) {
  const user = await requireInquiryReviewer();
  if (!id || id.length > 100) throw Error("메일 연결을 확인해 주세요.");
  // 다른 계정 ID를 보내도 토큰·사본에 접근할 수 없다. 원본 메일은 건드리지 않는다.
  await prisma.$transaction(async tx => {
    const mailbox = await tx.inboxMailbox.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
    if (!mailbox) throw Error("메일 연결을 찾을 수 없습니다.");
    const messages = await tx.inboxMail.findMany({ where: { mailboxId: id }, select: { id: true } });
    await tx.inboxFollowUp.deleteMany({ where: { ownerId: user.id, itemKey: { in: messages.map(row => `mail:${row.id}`) } } });
    await tx.inboxMailbox.delete({ where: { id } });
  });
}

export async function syncPrivateMailbox(id: string) {
  const user = await requireInquiryReviewer();
  if (!id || id.length > 100) throw Error("메일 연결을 확인해 주세요.");
  const now = new Date(), leaseToken = randomUUID();
  const claim = await prisma.inboxMailbox.updateMany({ where: { id, ownerId: user.id,
    AND: [{ OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - 60_000) } }] }] },
    data: { leaseToken, leaseUntil: new Date(now.getTime() + 120_000) } });
  if (claim.count !== 1) return;
  try {
    const account = await prisma.inboxMailbox.findFirst({ where: { id, ownerId: user.id, leaseToken } });
    if (!account) return;
    const messages = await readMailboxMessages(account);
    await prisma.$transaction(async tx => {
      // 조회 중 연결 해제·재연결·리스 만료가 일어나면 오래된 결과를 저장하지 않는다.
      const current = await tx.inboxMailbox.updateMany({ where: { id, ownerId: user.id, leaseToken, encryptedCredential: account.encryptedCredential, folder: account.folder, leaseUntil: { gt: new Date() } },
        data: { lastSyncedAt: new Date(), lastErrorCode: null, leaseToken: null, leaseUntil: null } });
      if (current.count !== 1) return;
      await tx.inboxMail.createMany({ data: messages.map(row => ({ ...row, mailboxId: id })), skipDuplicates: true });
      const expiredWhere = { mailboxId: id, receivedAt: { lt: new Date(Date.now() - 30 * 86400_000) } };
      const expired = await tx.inboxMail.findMany({ where: expiredWhere, select: { id: true } });
      await tx.inboxFollowUp.deleteMany({ where: { ownerId: user.id, itemKey: { in: expired.map(row => `mail:${row.id}`) } } });
      await tx.inboxMail.deleteMany({ where: expiredWhere });
    });
  } catch {
    await prisma.inboxMailbox.updateMany({ where: { id, ownerId: user.id, leaseToken }, data: { leaseToken: null, leaseUntil: null, lastSyncedAt: new Date(), lastErrorCode: "connection_failed" } });
    throw Error("메일 동기화에 실패했습니다. 라벨·메일함 이름과 연결 권한을 확인한 뒤 다시 시도해 주세요.");
  }
}

export async function saveInboxFollowUp(input: { itemKey: unknown; dueAt: unknown; note: unknown; version: unknown }) {
  const user = await requireInquiryReviewer();
  if (typeof input.itemKey !== "string" || input.itemKey.length > 200 || typeof input.note !== "string" || input.note.length > 1000 || typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 0) throw Error("연락 일정 입력을 확인해 주세요.");
  const itemKey = input.itemKey, dueAt = parseFollowUpDate(input.dueAt), note = input.note.trim();
  if (itemKey.startsWith("mail:")) {
    if (!await prisma.inboxMail.findFirst({ where: { id: itemKey.slice(5), mailbox: { ownerId: user.id } }, select: { id: true } })) throw Error("문의에 접근할 수 없습니다.");
  } else {
    const snapshot = await getInquiryNotificationSnapshot();
    const keys = new Set([...snapshot.inquiries.map(row => inquiryKey("customer", row.identity)), ...snapshot.registrations.map(row => inquiryKey("space-registration", row.identity)), ...snapshot.rentals.map(row => inquiryKey("space-rental", row.identity))]);
    if (!keys.has(itemKey)) throw Error("문의가 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
  }
  if (input.version === 0) {
    try { await prisma.inboxFollowUp.create({ data: { ownerId: user.id, itemKey, dueAt, note } }); }
    catch { throw Error("다른 화면에서 일정이 변경됐을 수 있습니다. 새로고침 후 확인해 주세요."); }
  } else {
    const result = await prisma.inboxFollowUp.updateMany({ where: { ownerId: user.id, itemKey, version: input.version }, data: { dueAt, note, version: { increment: 1 } } });
    if (result.count !== 1) throw Error("다른 화면에서 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
  }
}
