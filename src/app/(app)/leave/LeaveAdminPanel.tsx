"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { approveLeave, rejectLeave } from "@/app/actions/leave";
import { toast } from "sonner";

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  days: number;
  reason: string | null;
  user: { name: string | null; email: string };
}

const typeLabel: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};

export function LeaveAdminPanel({ requests: initial }: { requests: LeaveRequest[] }) {
  const [requests, setRequests] = useState<LeaveRequest[]>(initial);
  const [loading, setLoading] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/leave/pending");
      if (res.ok) setRequests(await res.json());
    } catch {}
  }, []);

  // 20초마다 새 신청 확인
  useEffect(() => {
    const id = setInterval(fetchPending, 20000);
    return () => clearInterval(id);
  }, [fetchPending]);

  const handleApprove = async (id: string) => {
    setLoading(id + "-approve");
    try {
      await approveLeave(id);
      toast.success("승인됐습니다.");
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      toast.error("처리 실패");
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setLoading(id + "-reject");
    try {
      await rejectLeave(id, "");
      toast.success("반려됐습니다.");
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      toast.error("처리 실패");
    } finally {
      setLoading(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <Card className="border-deep-violet/20 shadow-[var(--shadow-sm)]">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-deep-space-charcoal flex items-center gap-2" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
          승인 대기 <Badge className="bg-deep-violet/10 text-deep-violet border-0">{requests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-hint-of-sky">
            <div>
              <p className="text-sm font-medium text-midnight-charcoal">
                {r.user.name ?? r.user.email} · {typeLabel[r.type]} · {r.days}일
              </p>
              <p className="text-xs text-smoke-gray">
                {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                {r.type === "hourly" && r.startTime && r.endTime && ` (${r.startTime}~${r.endTime})`}
                {r.reason && ` · ${r.reason}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5"
                disabled={!!loading} onClick={() => handleReject(r.id)}>
                {loading === r.id + "-reject" ? "처리 중..." : "반려"}
              </Button>
              <Button size="sm" className="bg-deep-violet text-white hover:bg-rich-plum border-0"
                disabled={!!loading} onClick={() => handleApprove(r.id)}>
                {loading === r.id + "-approve" ? "처리 중..." : "승인"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
