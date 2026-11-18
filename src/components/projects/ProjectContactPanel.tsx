"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { recordProjectContactAction } from "@/app/actions/projectContact";
import { PROJECT_CONTACT_LABELS, type ProjectContactView } from "@/lib/projectContactPolicy";
import { toKstInput } from "@/lib/privateInboxPolicy";

const projectStatusLabels: Record<string, string> = { active: "진행 중", completed: "완료", on_hold: "보류" };
export function ProjectContactPanel({ project, canEdit, onChange }: { project: ProjectContactView; canEdit: boolean; onChange?: (project: ProjectContactView) => void }) {
  const [current, setCurrent] = useState(project);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = canEdit ? current : project;
  return <section className="space-y-4 text-sm" aria-label="프로젝트 연락 상태">
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-md border border-border px-2 py-1 text-xs">프로젝트 {projectStatusLabels[visible.projectStatus] ?? "확인 필요"}</span><strong>{PROJECT_CONTACT_LABELS[visible.contactStatus]}</strong></div>
    <p className="leading-relaxed text-muted-foreground">담당자 {visible.assignee || "미정"} · 연락 상태는 프로젝트 완료율·금액과 별도로 관리합니다.</p>
    {project.version > current.version && canEdit && <div role="status" className="space-y-2 rounded-lg border border-border p-3"><p>다른 화면에서 새 기록이 저장됐습니다. 작성 중인 내용은 유지했습니다.</p><Button size="sm" variant="outline" onClick={() => { setCurrent(project); setRequestId(crypto.randomUUID()); setMessage(""); }}>새 기록 불러오기</Button></div>}
    {canEdit ? <form key={current.version} className="space-y-3" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const input = { projectId: current.id, requestId, version: current.version, status: fields.get("status"), nextContactAt: fields.get("nextContactAt"), note: fields.get("note") };
      setMessage("");
      startTransition(async () => {
        try {
          const result = await recordProjectContactAction(input);
          if (!result.ok) { setMessage(result.message); return; }
          setCurrent(result.data); setRequestId(crypto.randomUUID()); onChange?.(result.data);
          setMessage("연락 상태를 저장했습니다. 문의 목록과 프로젝트 상세에 같은 기록이 반영됩니다.");
        } catch { setMessage("저장 상태를 확인하지 못했습니다. 새로고침 후 기록을 확인해 주세요."); }
      });
    }}>
      <label className="block font-medium">연락 상태<select name="status" defaultValue={current.contactStatus} disabled={pending} className="mt-1.5 block h-11 w-full rounded-lg border border-input bg-background px-3 text-base sm:h-10 sm:text-sm">{Object.entries(PROJECT_CONTACT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="block font-medium">다음 연락 · 한국시간<input name="nextContactAt" type="datetime-local" defaultValue={current.nextContactAt ? toKstInput(new Date(current.nextContactAt)) : ""} disabled={pending} className="mt-1.5 block h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base sm:h-10 sm:text-sm" /></label>
      <label className="block font-medium">연락 메모<textarea name="note" defaultValue={current.note} rows={3} maxLength={2000} disabled={pending} placeholder="예: 견적 전달 완료, 금요일 오전에 회신 확인" className="mt-1.5 block w-full resize-y rounded-lg border border-input bg-background p-3 text-base leading-relaxed sm:text-sm" /></label>
      <p className="text-xs leading-relaxed text-muted-foreground">견적서 업로드만으로 발송 처리하지 않습니다. 연락은 직접 완료한 뒤 기록해 주세요. 날짜 미정이면 비워두세요.</p>
      <Button type="submit" size="sm" className="min-h-11 sm:min-h-0" disabled={pending}>{pending ? "저장 중…" : "연락 상태 저장"}</Button>
    </form> : <p className="whitespace-pre-wrap leading-relaxed">{visible.note || "등록된 연락 메모가 없습니다."}</p>}
    {message && <p role="status" className="leading-relaxed">{message}</p>}
    <details className="border-t border-border pt-3"><summary className="cursor-pointer py-2 font-medium">연락 기록 {visible.history.length ? "보기" : "없음"}</summary><ol className="mt-2 space-y-3">{visible.history.map(log => <li key={log.id} className="border-b border-border pb-3 last:border-0"><p className="font-medium">{PROJECT_CONTACT_LABELS[log.status]} · {log.recordedBy}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">기록 시각 {new Date(log.recordedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>{log.note && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{log.note}</p>}</li>)}</ol><p className="mt-2 text-xs leading-relaxed text-muted-foreground">최근 10개를 표시합니다. 이전 기록은 삭제하지 않습니다. 기록 시각은 실제 발송·통화 시각의 증명이 아닙니다.</p></details>
    <Link href={`/projects/${visible.id}`} className="inline-block min-h-10 py-2 font-medium underline underline-offset-4">프로젝트 상세 열기</Link>
    <p className="text-xs leading-relaxed text-muted-foreground">프로젝트 접근 권한이 있는 내부 직원과 공유합니다. 개인 메일 원문은 공유하지 않습니다.</p>
  </section>;
}
