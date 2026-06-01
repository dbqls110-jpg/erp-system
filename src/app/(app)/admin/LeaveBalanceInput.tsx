"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setLeaveBalance } from "@/app/actions/admin";
import { toast } from "sonner";

export function LeaveBalanceInput({ userId, year, totalDays, usedDays }: {
  userId: string;
  year: number;
  totalDays: number;
  usedDays: number;
}) {
  const [days, setDays] = useState(String(totalDays));
  const [loading, setLoading] = useState(false);

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
    <div className="flex items-center gap-1 text-sm">
      <span className="text-smoke-gray text-xs">휴가</span>
      <Input
        type="number"
        value={days}
        onChange={(e) => setDays(e.target.value)}
        className="w-16 h-7 text-sm text-center px-1"
        min="0"
        step="0.5"
      />
      <span className="text-smoke-gray text-xs">일</span>
      <span className="text-xs text-smoke-gray">(사용 {usedDays})</span>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={loading} onClick={handleSave}>
        저장
      </Button>
    </div>
  );
}
