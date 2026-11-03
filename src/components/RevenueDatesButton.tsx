"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RevenueDateFields } from "@/components/RevenueDateFields";
import { updateRevenueDates } from "@/app/actions/revenueDates";
import type { RevenueDates } from "@/lib/revenueDates";

export function RevenueDatesButton({ source, id, dates }: { source: "entry" | "project"; id: string; dates: Partial<RevenueDates> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>날짜 수정</Button>
    <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader><DialogTitle>매출 날짜 수정</DialogTitle><DialogDescription>날짜를 변경하면 해당 월의 집계로 이동합니다. 매출 금액과 등록일은 변경하지 않습니다.</DialogDescription></DialogHeader>
        <form onSubmit={event => {
          event.preventDefault();
          if (pending) return;
          const form = new FormData(event.currentTarget);
          startTransition(async () => {
            try { await updateRevenueDates(source, id, form); setOpen(false); router.refresh(); toast.success("집계 날짜를 수정했습니다."); }
            catch { toast.error("날짜 저장에 실패했습니다. 입력 날짜와 수정 권한을 확인해 주세요."); }
          });
        }} className="space-y-4">
          <RevenueDateFields prefix={`revenue-${id}`} dates={dates} disabled={pending} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>취소</Button><Button type="submit" disabled={pending}>{pending ? "저장 중..." : "저장"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
