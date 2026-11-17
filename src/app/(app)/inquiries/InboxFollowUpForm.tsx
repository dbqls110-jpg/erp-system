"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveFollowUpAction } from "@/app/actions/privateInbox";
import { toKstInput, type FollowUpView, type PrivateInboxView } from "@/lib/privateInboxPolicy";

export function InboxFollowUpForm({ itemKey, value, onChange }: { itemKey: string; value: FollowUpView | undefined; onChange: (data: PrivateInboxView) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <form className="mt-5 space-y-3 border-t border-border pt-4" onSubmit={async event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try { onChange(await saveFollowUpAction({ itemKey, dueAt: String(fields.get("dueAt") ?? ""), note: String(fields.get("note") ?? ""), version: value?.version ?? 0 })); setMessage("다음 연락 일정을 저장했습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "저장에 실패했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }}>
    <h4 className="text-sm font-semibold">내 다음 연락 일정</h4>
    <label className="block text-xs text-muted-foreground">연락 일시 · 한국시간<input name="dueAt" type="datetime-local" defaultValue={value?.dueAt ? toKstInput(new Date(value.dueAt)) : ""} className="mt-1.5 block h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm text-foreground" /></label>
    <label className="block text-xs text-muted-foreground">연락 메모<textarea name="note" rows={3} maxLength={1000} defaultValue={value?.note ?? ""} placeholder="예: 주차 가능 여부 전화 확인" className="mt-1.5 block w-full resize-y rounded-lg border border-input bg-background p-2 text-sm text-foreground" /></label>
    <p className="text-xs leading-relaxed text-muted-foreground">본인 일정으로 저장합니다. 일시를 비우고 저장하면 해제됩니다. 자동 발송·알림은 하지 않습니다.</p>
    <Button type="submit" disabled={busy} size="sm">{busy ? "저장 중…" : "연락 일정 저장"}</Button>
    {message && <p role="status" className="text-xs leading-relaxed">{message}</p>}
  </form>;
}
