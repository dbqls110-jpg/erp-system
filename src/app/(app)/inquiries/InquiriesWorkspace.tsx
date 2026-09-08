"use client";

import { useState } from "react";
import { InquiriesKanban } from "./InquiriesKanban";
import { SpaceRegistrationKanban } from "./SpaceRegistrationKanban";
import type { InquiryRecord } from "@/lib/inquiries";
import type { SpaceRegistrationRecord } from "@/lib/spaceRegistrations";

interface Props {
  initialInquiries: InquiryRecord[];
  initialSpaceRegistrations: SpaceRegistrationRecord[];
  canEdit: boolean;
}

type Branch = "customer" | "space";

export function InquiriesWorkspace({ initialInquiries, initialSpaceRegistrations, canEdit }: Props) {
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
          aria-selected={branch === "space"}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${branch === "space" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setBranch("space")}
        >
          공간 등록
        </button>
      </div>

      {branch === "customer" ? (
        <InquiriesKanban initialInquiries={initialInquiries} canEdit={canEdit} />
      ) : (
        <SpaceRegistrationKanban initialRegistrations={initialSpaceRegistrations} canEdit={canEdit} />
      )}
    </div>
  );
}
