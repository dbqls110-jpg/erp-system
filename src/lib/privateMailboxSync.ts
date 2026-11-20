import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { canAccessMenu } from "@/lib/permissions";
import { readMailboxMessages } from "@/lib/privateInboxProviders";
import { MailboxError, mailboxErrorCode } from "@/lib/mailboxErrors";
import { AUTO_INBOX_SCOPE, dueAutomaticMailboxes } from "@/lib/privateInboxSyncPolicy";

type SyncResult = { kind: "synced"; imported: number } | { kind: "skipped" };
/** Server-internal: callers authenticate the session or maintenance key before resolving ownerId. */
export async function syncMailboxForOwner({ id, ownerId, trigger }: { id: string; ownerId: string; trigger: "manual" | "automatic" }): Promise<SyncResult> {
  const now = new Date(), leaseToken = randomUUID();
  const scope = trigger === "automatic" ? AUTO_INBOX_SCOPE : {};
  const due = trigger === "automatic" ? dueAutomaticMailboxes(now) : { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - 60_000) } }] };
  const claim = await prisma.inboxMailbox.updateMany({ where: { id, ownerId, AND: [due, { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }] },
    data: { leaseToken, leaseUntil: new Date(now.getTime() + 120_000) } });
  if (claim.count !== 1) return { kind: "skipped" };
  try {
    const account = await prisma.inboxMailbox.findFirst({ where: { id, ownerId, leaseToken, ...scope } });
    if (!account) return { kind: "skipped" };
    const stored = await prisma.inboxMail.findMany({ where: { mailboxId: id }, select: { providerMessageId: true }, orderBy: [{ receivedAt: "desc" }, { id: "asc" }], take: 200 });
    const messages = await readMailboxMessages(account, new Set(stored.map(row => row.providerMessageId)));
    if (trigger === "automatic" && !await canAccessMenu(ownerId, "inquiries")) return { kind: "skipped" };
    return await prisma.$transaction(async tx => {
      const current = await tx.inboxMailbox.updateMany({ where: { id, ownerId, leaseToken, ...scope,
        encryptedCredential: account.encryptedCredential, folder: account.folder, leaseUntil: { gt: new Date() } },
        data: { lastSyncedAt: new Date(), lastErrorCode: null, leaseToken: null, leaseUntil: null } });
      if (current.count !== 1) return { kind: "skipped" };
      const imported = await tx.inboxMail.createMany({ data: messages.map(row => ({ ...row, mailboxId: id })), skipDuplicates: true });
      if (trigger === "manual") {
        const expiredWhere = { mailboxId: id, receivedAt: { lt: new Date(Date.now() - 30 * 86400_000) } };
        const expired = await tx.inboxMail.findMany({ where: expiredWhere, select: { id: true } });
        await tx.inboxFollowUp.deleteMany({ where: { ownerId, itemKey: { in: expired.map(row => `mail:${row.id}`) } } });
        await tx.inboxMail.deleteMany({ where: expiredWhere });
      }
      return { kind: "synced", imported: imported.count };
    });
  } catch (error) {
    const code = mailboxErrorCode(error);
    await prisma.inboxMailbox.updateMany({ where: { id, ownerId, leaseToken }, data: { leaseToken: null, leaseUntil: null, lastSyncedAt: new Date(), lastErrorCode: code } });
    throw new MailboxError(code);
  } finally {
    await prisma.inboxMailbox.updateMany({ where: { id, ownerId, leaseToken }, data: { leaseToken: null, leaseUntil: null } });
  }
}
