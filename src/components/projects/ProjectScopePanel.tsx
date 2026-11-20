"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProjectScopeFields } from "./ProjectScopeFields";
import { saveProjectWorkspaceAction } from "@/app/actions/projectTask";
import { EVENT_TYPES } from "@/lib/projectReminderPolicy";

export function ProjectScopePanel({ project, hasTasks, canEdit }: { project: { id: string; workScope: string | null; eventType: string; eventDate: string | null; workspaceVersion: number }; hasTasks: boolean; canEdit: boolean }) {
  const [editing, setEditing] = useState(false), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const missing = !project.workScope?.trim() || !hasTasks;
  return <section id="project-scope" className="scroll-mt-20 space-y-3 rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">과업 · 실제 일정</h2>{canEdit && <Button variant="outline" size="sm" disabled={pending} onClick={() => setEditing(!editing)}>{editing ? "닫기" : "과업 등록·수정"}</Button>}</div>
    {missing && <p role="status" className="text-sm font-medium text-destructive">● 과업 미등록 · {!project.workScope?.trim() ? "업무 범위" : "할 일"}를 등록해 주세요. 견적서·파일은 그대로 유지됩니다.</p>}
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{project.workScope || "업무 범위 미등록"}</p>
    <p className="text-sm text-muted-foreground">{EVENT_TYPES[project.eventType as keyof typeof EVENT_TYPES] ?? "일반 업무"} · 실제 일정 {project.eventDate ?? "미정"}</p>
    {editing && <form key={project.workspaceVersion} className="space-y-3" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setError("");
      startTransition(async () => {
        try {
          const result = await saveProjectWorkspaceAction(project.id, Object.fromEntries(form), project.workspaceVersion);
          if (!result.ok) { setError(result.message); router.refresh(); return; }
          toast.success("과업과 실제 일정을 저장했습니다."); setEditing(false); router.refresh();
        } catch { setError("저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요."); }
      });
    }}><ProjectScopeFields {...project} prefix={`scope-${project.id}`} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={pending} type="submit">{pending ? "저장 중…" : "과업 저장"}</Button></form>}
  </section>;
}
