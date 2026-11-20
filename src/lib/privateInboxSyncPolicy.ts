import type { Prisma } from "@prisma/client";

export const AUTO_INBOX_COOLDOWN_MS = 4 * 60_000;
export const AUTO_INBOX_SCOPE = {
  owner: { email: { equals: "dbqls110@gmail.com", mode: "insensitive" }, active: true, isAgent: false,
    role: { notIn: ["pending", "partner", "host", "dot"] }, partnerId: null, customerId: null, venueId: null },
  OR: [{ provider: "gmail", folder: "ERP문의" }, { provider: "naver", folder: "INBOX" }],
} satisfies Prisma.InboxMailboxWhereInput;

export function dueAutomaticMailboxes(now: Date): Prisma.InboxMailboxWhereInput {
  const normal = new Date(now.getTime() - AUTO_INBOX_COOLDOWN_MS), attention = new Date(now.getTime() - 60 * 60_000);
  return { AND: [AUTO_INBOX_SCOPE, { OR: [
    { lastSyncedAt: null },
    { lastSyncedAt: { lt: normal }, OR: [{ lastErrorCode: null }, { lastErrorCode: { in: ["connection_failed", "connection_timeout"] } }] },
    { lastSyncedAt: { lt: attention } },
  ] }] };
}
