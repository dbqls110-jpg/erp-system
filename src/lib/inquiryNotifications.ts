import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessMenu } from "@/lib/permissions";
import { canReviewInquiries } from "@/lib/inquiryAccess";
import { getInquiries } from "@/lib/inquirySheet";
import { getSpaceRegistrations } from "@/lib/spaceRegistrationSheet";
import { getSpaceRentals } from "@/lib/spaceRentalSheet";
import { inquiryKey, parseInquiryReadKeys, type InquiryKeyGroups } from "@/lib/inquiryNotificationKeys";

async function loadSnapshot() {
  const [inquiries, registrations, rentals] = await Promise.all([getInquiries(), getSpaceRegistrations(), getSpaceRentals({ ensureHeaders: false })]);
  const keys: InquiryKeyGroups = {
    customer: inquiries.filter(row => row.status !== "종료" && row.status !== "성사").map(row => inquiryKey("customer", row.identity)),
    "space-registration": registrations.filter(row => row.status !== "반려" && row.status !== "등록 완료").map(row => inquiryKey("space-registration", row.identity)),
    "space-rental": rentals.filter(row => row.status !== "종료" && row.status !== "성사").map(row => inquiryKey("space-rental", row.identity)),
  };
  return { inquiries, registrations, rentals, keys };
}
type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
let cached: { at: number; snapshot: Snapshot } | null = null;
let revision = 0;
let inFlight: { revision: number; promise: Promise<Snapshot> } | null = null;
export function invalidateInquiryNotificationSnapshot() { revision++; cached = null; }
/** 두 승인 계정이 같은 시트를 중복 조회하지 않도록 30초간 단일 읽기를 공유한다. */
export async function getInquiryNotificationSnapshot() {
  if (cached && Date.now() - cached.at < 30_000) return cached.snapshot;
  if (!inFlight || inFlight.revision !== revision) {
    const loadingRevision = revision;
    const promise = loadSnapshot().then(snapshot => { if (loadingRevision === revision) cached = { at: Date.now(), snapshot }; return snapshot; })
      .finally(() => { if (inFlight?.revision === loadingRevision) inFlight = null; });
    inFlight = { revision: loadingRevision, promise };
  }
  return inFlight.promise;
}
export async function requireInquiryReviewer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw Error("Unauthorized");
  if (!canReviewInquiries(session.user) || !await canAccessMenu(session.user.id, "inquiries")) throw Error("Forbidden");
  return session.user;
}
export async function countUnreadInquiries(userId: string, keys: InquiryKeyGroups) {
  const reads = new Set((await prisma.inquiryReadReceipt.findMany({ where: { userId }, select: { itemKey: true } })).map(row => row.itemKey));
  const counts = { customer: 0, "space-registration": 0, "space-rental": 0 };
  for (const branch of ["customer", "space-registration", "space-rental"] as const) counts[branch] = new Set(keys[branch].filter(key => !reads.has(key))).size;
  return { ...counts, total: counts.customer + counts["space-registration"] + counts["space-rental"] };
}
export async function getInquiryUnreadCounts() {
  const user = await requireInquiryReviewer();
  const snapshot = await getInquiryNotificationSnapshot();
  return countUnreadInquiries(user.id, snapshot.keys);
}
export async function recordInquiryRead(input: unknown) {
  const user = await requireInquiryReviewer();
  const keys = parseInquiryReadKeys(input);
  const snapshot = await getInquiryNotificationSnapshot();
  const current = new Set(Object.values(snapshot.keys).flat());
  const seen = keys.filter(key => current.has(key));
  if (seen.length) await prisma.inquiryReadReceipt.createMany({ data: seen.map(itemKey => ({ userId: user.id, itemKey })), skipDuplicates: true });
  return countUnreadInquiries(user.id, snapshot.keys);
}
