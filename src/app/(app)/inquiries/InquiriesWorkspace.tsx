"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInquiryNotifications } from "@/lib/inquiry-notifications-store";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import type { InquiryKeyGroups } from "@/lib/inquiryNotificationKeys";
import { InquiriesKanban } from "./InquiriesKanban";
import { SpaceRegistrationKanban } from "./SpaceRegistrationKanban";
import { SpaceRentalKanban } from "./SpaceRentalKanban";
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

type Branch = "customer" | "space-registration" | "space-rental";

export function InquiriesWorkspace({ initialInquiries, initialSpaceRegistrations, initialSpaceRentals, canEdit, notificationKeys }: Props) {
  const [branch, setBranch] = useState<Branch>("customer");
  const notifications = useInquiryNotifications();
  const router = useRouter();
  const acknowledged = useRef(new Set<string>());
  const key = `${branch}:${notificationKeys[branch].join("|")}`;
  useVisiblePolling(async () => {
    if (!notifications.enabled || document.visibilityState !== "visible" || acknowledged.current.has(key)) return;
    acknowledged.current.add(key);
    try { await notifications.markRead(notificationKeys[branch]); }
    catch { acknowledged.current.delete(key); }
  }, 30_000, { refreshKey: key });
  const unreadBadge = (value: number) => value > 0 ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[11px] text-white" aria-label={`미확인 ${value}건`}>{value}</span> : null;
  const newSpaceRegistrationCount = initialSpaceRegistrations.filter((registration) => registration.status === "접수").length;

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-0.5 rounded-[10px] bg-[#e9ebf0] p-[3px] dark:bg-muted/50" role="tablist" aria-label="문의 갈래">
        <button
          type="button"
          role="tab"
          aria-selected={branch === "customer"}
          className={`rounded-[8px] px-3.5 py-1.5 text-[13px] transition ${branch === "customer" ? "bg-white font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-card" : "font-normal text-[#6b7280] hover:text-foreground dark:text-muted-foreground"}`}
          onClick={() => setBranch("customer")}
        >
          고객 문의{unreadBadge(notifications.counts.customer)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={branch === "space-registration"}
          className={`rounded-[8px] px-3.5 py-1.5 text-[13px] transition ${branch === "space-registration" ? "bg-white font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-card" : "font-normal text-[#6b7280] hover:text-foreground dark:text-muted-foreground"}`}
          onClick={() => setBranch("space-registration")}
        >
          <span>공간 등록</span>
          {unreadBadge(notifications.counts["space-registration"])}
          {newSpaceRegistrationCount > 0 && (
            <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
              {newSpaceRegistrationCount}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={branch === "space-rental"}
          className={`rounded-[8px] px-3.5 py-1.5 text-[13px] transition ${branch === "space-rental" ? "bg-white font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-card" : "font-normal text-[#6b7280] hover:text-foreground dark:text-muted-foreground"}`}
          onClick={() => setBranch("space-rental")}
        >
          공간대관{unreadBadge(notifications.counts["space-rental"])}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">현재 갈래의 목록을 열면 내 계정에서만 확인 처리합니다. 다른 담당자의 미확인 상태는 유지됩니다.</p>
      {notifications.failed && <p role="alert" className="text-sm text-amber-700">문의 알림 확인이 지연되고 있습니다. 기존 미확인 알림은 유지됩니다.</p>}
      {notifications.counts[branch] > 0 && <button type="button" onClick={() => router.refresh()} className="text-sm text-primary underline">새 문의 목록 불러오기</button>}

      {branch === "customer" ? (
        <InquiriesKanban initialInquiries={initialInquiries} canEdit={canEdit} />
      ) : branch === "space-registration" ? (
        <SpaceRegistrationKanban initialRegistrations={initialSpaceRegistrations} canEdit={canEdit} />
      ) : (
        <SpaceRentalKanban initialRentals={initialSpaceRentals} canEdit={canEdit} />
      )}
    </div>
  );
}
