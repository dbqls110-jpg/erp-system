"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const typeLabel: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};
const statusLabel: Record<string, { label: string; class: string }> = {
  pending: { label: "승인 대기", class: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  approved: { label: "승인", class: "bg-green-50 text-green-700 border-green-200" },
  rejected: { label: "반려", class: "bg-red-50 text-red-700 border-red-200" },
};

interface LeaveRecord {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  days: number;
  reason: string | null;
  status: string;
}

interface Props {
  name: string;
  requests: LeaveRecord[];
}

export function LeaveHistoryButton({ name, requests }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-medium text-midnight-charcoal hover:text-deep-violet transition-colors underline-offset-2 hover:underline"
      >
        {name}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{name} 휴가 내역</DialogTitle>
          </DialogHeader>
          {requests.length === 0 ? (
            <p className="text-sm text-smoke-gray py-4">신청 내역이 없습니다.</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {requests.map((r) => {
                const s = statusLabel[r.status] ?? statusLabel.pending;
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-midnight-charcoal">{typeLabel[r.type]}</span>
                      <span className="text-smoke-gray">
                        {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                        {r.type === "hourly" && r.startTime && r.endTime && (
                          <span className="ml-1 text-electric-blue">({r.startTime}~{r.endTime})</span>
                        )}
                      </span>
                      {r.reason && <span className="text-smoke-gray text-xs hidden sm:inline">· {r.reason}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-smoke-gray">{r.days}일</span>
                      <Badge variant="outline" className={s.class}>{s.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
