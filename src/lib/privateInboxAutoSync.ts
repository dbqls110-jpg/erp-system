import { prisma } from "@/lib/prisma";
import { canAccessMenu } from "@/lib/permissions";
import { syncMailboxForOwner } from "@/lib/privateMailboxSync";
import { dueAutomaticMailboxes } from "@/lib/privateInboxSyncPolicy";

export async function syncDuePrivateMailboxes() {
  const accounts = await prisma.inboxMailbox.findMany({ where: dueAutomaticMailboxes(new Date()),
    select: { id: true, ownerId: true }, orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 4 });
  const result = { checked: accounts.length, synced: 0, skipped: 0, failed: 0 };
  for (let offset = 0; offset < accounts.length; offset += 2) {
    await Promise.all(accounts.slice(offset, offset + 2).map(async account => {
      try {
        if (!await canAccessMenu(account.ownerId, "inquiries")) { result.skipped++; return; }
        const sync = await syncMailboxForOwner({ ...account, trigger: "automatic" });
        if (sync.kind === "synced") result.synced++; else result.skipped++;
      } catch { result.failed++; }
    }));
  }
  return result;
}
