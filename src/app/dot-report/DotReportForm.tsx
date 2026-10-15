"use client";

import { useRef, useState, useTransition } from "react";
import { DOT_RECIPIENT_EMAIL } from "@/lib/dotPolicy";

export default function DotReportForm({ date }: { date: string }) {
  const [kind, setKind] = useState("audit");
  const [auditId, setAuditId] = useState(`audit-${date}-erp-connect`);
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ messageId: string; duplicate: boolean } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const sending = useRef(false);
  const runId = kind === "daily" ? `daily-${date}` : auditId;
  return <form className="space-y-4 rounded-xl border p-5" onSubmit={event => {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/agent/dot/reports", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, kind, body }) });
        const data = await response.json();
        if (!response.ok || typeof data.messageId !== "string") throw new Error(typeof data.error === "string" ? data.error : "보고를 전송하지 못했습니다.");
        setResult({ messageId: data.messageId, duplicate: data.duplicate === true });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "연결을 확인한 뒤 같은 보고로 재시도하세요.");
      } finally { sending.current = false; }
    });
  }}>
    <p className="text-sm">수신자: {DOT_RECIPIENT_EMAIL} (서버 고정)</p>
    <label className="block space-y-1 text-sm">보고 종류
      <select value={kind} disabled={pending || !!result} onChange={event => setKind(event.target.value)} className="block w-full rounded-md border bg-background p-2">
        <option value="audit">연결 검증 보고</option><option value="daily">일일 점검 보고</option>
      </select>
    </label>
    <label className="block space-y-1 text-sm">보고 실행 ID
      <input value={runId} readOnly={kind === "daily"} disabled={pending || !!result} onChange={event => setAuditId(event.target.value)} required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}" className="block w-full rounded-md border bg-background p-2" />
    </label>
    <label className="block space-y-1 text-sm">보고 내용
      <textarea value={body} disabled={pending || !!result} onChange={event => setBody(event.target.value)} required maxLength={12000} rows={14} className="block w-full rounded-md border bg-background p-2" />
    </label>
    <p className="text-sm text-muted-foreground">응답 유실 시 실행 ID와 내용을 바꾸지 말고 재전송하세요. 같은 보고는 메시지를 중복 생성하지 않습니다.</p>
    <button disabled={pending || !body.trim()} className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50">{pending ? "전송 중…" : result ? "같은 보고 재전송 (중복 확인)" : "ERP 메신저로 보고 전송"}</button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {result ? <p role="status" className="text-sm">{result.duplicate ? "기존 보고 확인 · 중복 생성 없음" : "보고 전송 완료"} · 메시지 ID: {result.messageId}</p> : null}
  </form>;
}
