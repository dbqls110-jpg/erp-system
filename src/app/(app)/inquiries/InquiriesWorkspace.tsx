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
      <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1" role="tablist" aria-label="문의 갈래">
        <button
          type="button"
          role="tab"
          aria-selected={branch === "customer"}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${branch === "customer" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setBranch("customer")}
        >
          고객 문의
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={branch === "space-registration"}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${branch === "space-registration" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setBranch("space-registration")}
        >
          공간 등록
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={branch === "space-rental"}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${branch === "space-rental" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
