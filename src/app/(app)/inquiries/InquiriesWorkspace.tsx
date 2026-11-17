"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInquiryNotifications } from "@/lib/inquiry-notifications-store";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import type { InquiryKeyGroups } from "@/lib/inquiryNotificationKeys";
import { InquiriesKanban } from "./InquiriesKanban";
import { SpaceRegistrationKanban } from "./SpaceRegistrationKanban";
import { SpaceRentalKanban } from "./SpaceRentalKanban";
import { UnifiedInquiryInbox } from "./UnifiedInquiryInbox";
import type { InquiryBranch } from "@/lib/inquiryInbox";
import type { InquiryRecord } from "@/lib/inquiries";
import type { SpaceRegistrationRecord } from "@/lib/spaceRegistrations";
import type { SpaceRentalRecord } from "@/lib/spaceRentals";

interface Props {
  initialInquiries: InquiryRecord[];
  initialSpaceRegistrations: SpaceRegistrationRecord[];
  initialSpaceRentals: Array<SpaceRentalRecord & { projectId?: string }>;
  canEdit: boolean;
  notificationKeys: InquiryKeyGroups;
}

type View = "unified" | InquiryBranch;
const views: ReadonlyArray<{ value: View; label: string }> = [
  { value: "unified", label: "통합 보기" },
  { value: "customer", label: "고객 문의" },
  { value: "space-registration", label: "공간 등록" },
  { value: "space-rental", label: "공간대관" },
];

export function InquiriesWorkspace({ initialInquiries, initialSpaceRegistrations, initialSpaceRentals, canEdit, notificationKeys }: Props) {
  const [view, setView] = useState<View>("unified");
  const notifications = useInquiryNotifications();
  const router = useRouter();
  const acknowledged = useRef(new Set<string>());
  const key = view === "unified" ? "unified" : `${view}:${notificationKeys[view].join("|")}`;
  useVisiblePolling(async () => {
    if (view === "unified" || !notifications.enabled || document.visibilityState !== "visible" || acknowledged.current.has(key)) return;
    acknowledged.current.add(key);
    try { await notifications.markRead(notificationKeys[view]); }
    catch { acknowledged.current.delete(key); }
  }, 30_000, { refreshKey: key });
  const unreadBadge = (value: number) => value > 0 ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[11px] text-white" aria-label={`미확인 ${value}건`}>{value}</span> : null;
  const newSpaceRegistrationCount = initialSpaceRegistrations.filter((registration) => registration.status === "접수").length;

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-muted p-[3px]" role="group" aria-label="문의 보기 선택">
        {views.map(item => <button key={item.value} type="button" aria-pressed={view === item.value} onClick={() => setView(item.value)} className={`min-h-10 rounded-lg px-3.5 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === item.value ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
          {item.label}{item.value !== "unified" && unreadBadge(notifications.counts[item.value])}
          {item.value === "space-registration" && newSpaceRegistrationCount > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground" aria-label={`신규 접수 ${newSpaceRegistrationCount}건`}>{newSpaceRegistrationCount}</span>}
        </button>)}
      </div>
      {notifications.failed && <p role="alert" className="text-sm text-amber-700">문의 알림 확인이 지연되고 있습니다. 기존 미확인 알림은 유지됩니다.</p>}
      {Object.values(notifications.counts).some(count => count > 0) && <button type="button" onClick={() => router.refresh()} className="min-h-9 rounded-sm text-sm text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">새 문의 목록 불러오기</button>}

      {view === "unified" ? <UnifiedInquiryInbox inquiries={initialInquiries} registrations={initialSpaceRegistrations} rentals={initialSpaceRentals} onOpenBoard={setView} /> : view === "customer" ? (
        <InquiriesKanban initialInquiries={initialInquiries} canEdit={canEdit} />
      ) : view === "space-registration" ? (
        <SpaceRegistrationKanban initialRegistrations={initialSpaceRegistrations} canEdit={canEdit} />
      ) : (
        <SpaceRentalKanban initialRentals={initialSpaceRentals} canEdit={canEdit} />
      )}
      <p className="text-xs text-muted-foreground">통합 조회는 미확인 상태를 유지합니다. 개별 보드를 열면 그 갈래만 내 계정에서 확인 처리합니다. 다른 담당자의 미확인 상태와 메일함의 읽음 상태는 바꾸지 않습니다.</p>
    </div>
  );
}
