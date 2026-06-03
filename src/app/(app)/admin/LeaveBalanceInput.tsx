"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setLeaveBalance } from "@/app/actions/admin";
import { toast } from "sonner";

export function LeaveBalanceInput({ userId, year, totalDays, usedDays, pendingDays }: {
  userId: string;
  year: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
}) {
  const [days, setDays] = useState(String(totalDays));
  const [loading, setLoading] = useState(false);

  const remaining = Math.max(0, totalDays - usedDays - pendingDays);

  const handleSave = async () => {
    const val = parseFloat(days);
    if (isNaN(val) || val < 0) return toast.error("올바른 숫자를 입력하세요.");
    setLoading(true);
    try {
      await setLeaveBalance(userId, year, val);
      toast.success("휴가 일수가 변경됐습니다.");
    } catch {
      toast.error("변경 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-smoke-gray">총</span>
        <Input
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-14 h-7 text-sm text-center px-1"
          min="0"
          step="0.5"
        />
        <span className="text-smoke-gray">일</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={loading} onClick={handleSave}>
          저장
        </Button>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-smoke-gray">사용 <span className="text-midnight-charcoal font-medium">{usedDays}일</span></span>
        <span className="text-smoke-gray">·</span>
        <span className="text-smoke-gray">대기 <span className="text-warm-fade font-medium">{pendingDays}일</span></span>
        <span className="text-smoke-gray">·</span>
        <span className="text-smoke-gray">잔여 <span className={`font-semibold ${remaining === 0 ? "text-destructive" : "text-deep-violet"}`}>{remaining}일</span></span>
      </div>
    </div>
  );
}
