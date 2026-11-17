import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessMenu } from "@/lib/permissions";
import { getInquiryNotificationSnapshot } from "@/lib/inquiryNotifications";
import { inquiryKey } from "@/lib/inquiryNotificationKeys";
import { INQUIRY_EMAIL_CONFIG_ID as id, isInquiryEmailOwner } from "@/lib/inquiryEmailPolicy";
import { InquiryMailError, sendInquiryEmail } from "@/lib/inquiryEmailGmail";

export async function requireInquiryEmailOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isInquiryEmailOwner(session.user)) throw Error("이메일 알림 설정 권한이 없습니다.");
  const userId = session.user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!isInquiryEmailOwner(user) || !await canAccessMenu(userId, "inquiries")) throw Error("이메일 알림 설정 권한이 없습니다.");
  return userId;
}
async function allInquiryKeys() {
  const snapshot = await getInquiryNotificationSnapshot();
  return [...new Set([
    ...snapshot.inquiries.map(row => inquiryKey("customer", row.identity)),
    ...snapshot.registrations.map(row => inquiryKey("space-registration", row.identity)),
    ...snapshot.rentals.map(row => inquiryKey("space-rental", row.identity)),
  ])];
}
async function claim(enabledOnly: boolean) {
  const token = randomUUID();
  const now = new Date();
  const result = await prisma.inquiryEmailConfig.updateMany({ where: { id, ...(enabledOnly ? { enabled: true } : {}),
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 10 * 60_000) } });
  return result.count === 1 ? token : null;
}
async function release(token: string) {
  await prisma.inquiryEmailConfig.updateMany({ where: { id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
}
async function observe(token: string, reset: boolean) {
  const keys = await allInquiryKeys();
  return prisma.$transaction(async tx => {
    const config = await tx.inquiryEmailConfig.findFirst({ where: { id, leaseToken: token } });
    if (!config) throw Error("이메일 알림 확인 작업이 만료되었습니다.");
    const baseline = reset || !config.initializedAt;
    if (baseline) await tx.inquiryEmailDelivery.updateMany({ where: { configId: id, status: "pending" }, data: { status: "baseline" } });
    if (keys.length) await tx.inquiryEmailDelivery.createMany({ data: keys.map(itemKey => ({ configId: id, itemKey, status: baseline ? "baseline" : "pending" })), skipDuplicates: true });
    const saved = await tx.inquiryEmailConfig.updateMany({ where: { id, leaseToken: token }, data: { initializedAt: config.initializedAt ?? new Date(), lastCheckedAt: new Date() } });
    if (saved.count !== 1) throw Error("이메일 알림 확인 작업이 만료되었습니다.");
    return baseline;
  });
}
export async function getInquiryEmailStatus() {
  await requireInquiryEmailOwner();
  const config = await prisma.inquiryEmailConfig.findUnique({ where: { id }, select: { enabled: true, connectedAt: true, lastCheckedAt: true, lastSentAt: true, lastErrorCode: true } });
  const uncertain = config ? await prisma.inquiryEmailDelivery.count({ where: { configId: id, status: { in: ["uncertain", "failed"] } } }) : 0;
  return { config, uncertain };
}
export async function enableInquiryEmails() {
  await requireInquiryEmailOwner();
  const token = await claim(false);
  if (!token) return { ok: false, code: "busy" };
  try {
    const config = await prisma.inquiryEmailConfig.findUniqueOrThrow({ where: { id } });
    if (!config.encryptedRefreshToken) return { ok: false, code: "auth_required" };
    // 연결·재개 시 과거 문의를 메일로 쏟아 보내지 않는다.
    await observe(token, true);
    await sendInquiryEmail(config.encryptedRefreshToken, "connection-check");
    const saved = await prisma.inquiryEmailConfig.updateMany({ where: { id, leaseToken: token }, data: { enabled: true, lastErrorCode: null, lastSentAt: new Date() } });
    return { ok: saved.count === 1, code: saved.count === 1 ? "enabled" : "cancelled" };
  } catch (error) {
    const code = error instanceof InquiryMailError ? error.code : "setup_failed";
    await prisma.inquiryEmailConfig.updateMany({ where: { id, leaseToken: token }, data: { enabled: false, lastErrorCode: code } });
    return { ok: false, code };
  } finally { await release(token); }
}
export async function pauseInquiryEmails() {
  await requireInquiryEmailOwner();
  await prisma.inquiryEmailConfig.updateMany({ where: { id }, data: { enabled: false, leaseToken: null, leaseUntil: null } });
}
export async function deliverNewInquiryEmails() {
  const config = await prisma.inquiryEmailConfig.findUnique({ where: { id }, include: { user: true } });
  if (!config?.enabled || !config.encryptedRefreshToken) return { status: "disabled", sent: 0 };
  if (!isInquiryEmailOwner(config.user) || !await canAccessMenu(config.userId, "inquiries")) {
    await prisma.inquiryEmailConfig.update({ where: { id }, data: { enabled: false, lastErrorCode: "owner_inactive" } });
    return { status: "disabled", sent: 0 };
  }
  const token = await claim(true);
  if (!token) return { status: "busy", sent: 0 };
  let sent = 0;
  let needsAttention = false;
  try {
    await observe(token, false);
    await prisma.inquiryEmailDelivery.updateMany({ where: { configId: id, status: "sending", attemptedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, data: { status: "uncertain" } });
    const pending = await prisma.inquiryEmailDelivery.findMany({ where: { configId: id, status: "pending", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 5 });
    for (const row of pending) {
      if (!await prisma.inquiryEmailConfig.findFirst({ where: { id, leaseToken: token, enabled: true }, select: { id: true } })) break;
      const acquired = await prisma.inquiryEmailDelivery.updateMany({ where: { configId: id, itemKey: row.itemKey, status: "pending" }, data: { status: "sending", attempts: { increment: 1 }, attemptToken: token, attemptedAt: new Date() } });
      if (acquired.count !== 1) continue;
      const where = { configId: id, itemKey: row.itemKey, status: "sending", attemptToken: token };
      try {
        const gmailMessageId = await sendInquiryEmail(config.encryptedRefreshToken, row.itemKey);
        await prisma.$transaction([
          prisma.inquiryEmailDelivery.updateMany({ where, data: { status: "sent", gmailMessageId, sentAt: new Date() } }),
          prisma.inquiryEmailConfig.updateMany({ where: { id, leaseToken: token }, data: { lastSentAt: new Date(), lastErrorCode: null } }),
        ]);
        sent++;
      } catch (error) {
        const known = error instanceof InquiryMailError;
        const retry = known && error.delivery === "not_sent" && (error.code === "rate_limited" || error.code === "provider_unavailable") && row.attempts < 4;
        await prisma.inquiryEmailDelivery.updateMany({ where, data: { status: retry ? "pending" : known && error.delivery === "not_sent" ? "failed" : "uncertain", nextAttemptAt: new Date(Date.now() + 10 * 60_000) } });
        const code = known ? error.code : "delivery_uncertain";
        await prisma.inquiryEmailConfig.updateMany({ where: { id, leaseToken: token }, data: { lastErrorCode: code, ...(code === "auth_required" || code === "gmail_api_disabled" ? { enabled: false } : {}) } });
        needsAttention = true;
        break;
      }
    }
    return { status: needsAttention ? "needs_attention" : "checked", sent };
  } catch {
    await prisma.inquiryEmailConfig.updateMany({ where: { id, leaseToken: token }, data: { lastErrorCode: "scan_failed" } });
    throw Error("이메일 알림 확인 작업에 실패했습니다.");
  } finally { await release(token); }
}
