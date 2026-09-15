"use client";

import { useState } from "react";
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
}

type Branch = "customer" | "space-registration" | "space-rental";

export function InquiriesWorkspace({ initialInquiries, initialSpaceRegistrations, initialSpaceRentals, canEdit }: Props) {
  const [branch, setBranch] = useState<Branch>("customer");

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
          고객 문의
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={branch === "space-registration"}
          className={`rounded-[8px] px-3.5 py-1.5 text-[13px] transition ${branch === "space-registration" ? "bg-white font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-card" : "font-normal text-[#6b7280] hover:text-foreground dark:text-muted-foreground"}`}
          onClick={() => setBranch("space-registration")}
        >
          공간 등록
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={branch === "space-rental"}
          className={`rounded-[8px] px-3.5 py-1.5 text-[13px] transition ${branch === "space-rental" ? "bg-white font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-card" : "font-normal text-[#6b7280] hover:text-foreground dark:text-muted-foreground"}`}
          onClick={() => setBranch("space-rental")}
        >
          공간대관
        </button>
      </div>

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
