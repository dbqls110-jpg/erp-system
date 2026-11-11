import { isExternal } from "@/lib/calendarVisibility";
import { isDotReadOnly } from "@/lib/dotPolicy";

type InquiryPrincipal = {
  id: string; email?: string | null; role?: string | null; active?: boolean; isAgent?: boolean;
  partnerId?: string | null; customerId?: string | null; venueId?: string | null;
};
const INQUIRY_REVIEWERS = new Set(["dbqls110@gmail.com", "qkrtjrdud952@gmail.com"]);

export function canReviewInquiries(user: InquiryPrincipal | null | undefined) {
  if (!user?.id || user.active === false || user.isAgent || !user.role || user.role === "pending" || isDotReadOnly(user.role)) return false;
  return INQUIRY_REVIEWERS.has(user.email?.trim().toLowerCase() ?? "")
    && !isExternal({ id: user.id, role: user.role, partnerId: user.partnerId ?? null, customerId: user.customerId ?? null, venueId: user.venueId ?? null });
}
