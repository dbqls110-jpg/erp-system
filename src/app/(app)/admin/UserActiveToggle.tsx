"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setUserActive } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toneBadgeClass } from "@/lib/badge-tone";

export function UserActiveToggle({
  userId,
  name,
  initialActive,
  isCurrentUser,
}: {
  userId: string;
  name: string;
  initialActive: boolean;
  isCurrentUser: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (isCurrentUser) return;
    const next = !active;
    const message = next
      ? `'${name}' 계정을 재활성화할까요? 로그인과 메신저 사용이 다시 가능해집니다.`
      : `'${name}' 계정을 비활성화할까요? 로그인과 메신저 사용이 막히며 기존 기록은 보존됩니다.`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      try {
        await setUserActive(userId, next);
        setActive(next);
        toast.success(next ? "계정을 재활성화했습니다." : "계정을 비활성화했습니다.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "계정 상태 변경 실패");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={toneBadgeClass(active ? "green" : "gray")}>
        {active ? "활성" : "비활성"}
      </Badge>
      {!isCurrentUser && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleToggle}
          disabled={isPending}
          aria-label={`${name} 계정 ${active ? "비활성화" : "재활성화"}`}
        >
          {isPending ? "처리 중…" : active ? "비활성화" : "재활성화"}
        </Button>
      )}
    </div>
  );
}
