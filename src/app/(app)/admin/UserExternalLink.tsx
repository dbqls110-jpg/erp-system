"use client";

import { useState } from "react";
import { linkUserToExternal } from "@/app/actions/admin";
import { toast } from "sonner";

type ExternalOption = { id: string; name: string };

export function UserExternalLink({
  userId,
  isCurrentUser,
  partnerId,
  customerId,
  partners,
  customers,
}: {
  userId: string;
  isCurrentUser: boolean;
  partnerId: string | null;
  customerId: string | null;
  partners: ExternalOption[];
  customers: ExternalOption[];
}) {
  const currentValue = partnerId ? `partner:${partnerId}` : customerId ? `customer:${customerId}` : "";
  const [selectedValue, setSelectedValue] = useState(currentValue);
  const [isSaving, setIsSaving] = useState(false);
  const isExternal = Boolean(partnerId || customerId);
  const hasExternalSelection = isCurrentUser ? isExternal : selectedValue !== "";

  if (isCurrentUser) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>본인</span>
        {hasExternalSelection && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-500">
            외부
          </span>
        )}
      </div>
    );
  }

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    const previousValue = selectedValue;
    setSelectedValue(nextValue);
    setIsSaving(true);

    try {
      if (nextValue.startsWith("partner:")) {
        await linkUserToExternal(userId, { partnerId: nextValue.slice("partner:".length), customerId: null });
      } else if (nextValue.startsWith("customer:")) {
        await linkUserToExternal(userId, { partnerId: null, customerId: nextValue.slice("customer:".length) });
      } else {
        await linkUserToExternal(userId, { partnerId: null, customerId: null });
      }
      toast.success("연결을 저장했습니다.");
    } catch (err) {
      setSelectedValue(previousValue);
      toast.error(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedValue}
        onChange={handleChange}
        disabled={isSaving}
        className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        aria-label="외부 연결"
      >
        <option value="">내부 직원</option>
        <optgroup label="── 파트너 ──">
          {partners.map((partner) => (
            <option key={partner.id} value={`partner:${partner.id}`}>
              {partner.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="── 거래처 ──">
          {customers.map((customer) => (
            <option key={customer.id} value={`customer:${customer.id}`}>
              {customer.name}
            </option>
          ))}
        </optgroup>
      </select>
      {hasExternalSelection && (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-500">
          외부
        </span>
      )}
    </div>
  );
}
