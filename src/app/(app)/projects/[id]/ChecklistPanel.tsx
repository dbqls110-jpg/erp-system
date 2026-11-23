"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { TaskEditor, type TaskEditorState } from "@/components/projects/TaskEditor";
import { completeProjectTaskAction } from "@/app/actions/projectTask";
import { taskAttentionLabel, type ProjectTask, type TaskPerson } from "@/lib/projectTaskPolicy";
import { currentKoreanDateKey, formatKoreanShortDate } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";

export function ChecklistPanel({ projectId, projectName, projectStatus, projectAssignee, items, people, canEdit }: {
  projectId: string; projectName: string; projectStatus: string; projectAssignee: string | null; items: ProjectTask[]; people: TaskPerson[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<TaskEditorState>({ kind: "closed" });
  const [pending, startTransition] = useTransition();
  const today = currentKoreanDateKey();
  function setDone(task: ProjectTask, done: boolean) {
    startTransition(async () => {
      try {
        const result = await completeProjectTaskAction({ id: task.id, projectId, done, version: task.version });
        if (!result.ok) { toast.error(result.message); router.refresh(); }
      } catch { toast.error("업무 저장을 확인하지 못했습니다. 새로고침 후 확인해 주세요."); }
    });
  }
  return <div id="project-tasks" className="space-y-3 scroll-mt-24" aria-busy={pending}>
    {items.length ? <ul className="divide-y divide-border">{items.map(task => <li key={task.id} id={`task-${task.id}`} className="flex scroll-mt-24 items-start gap-3 py-3">
      <input type="checkbox" checked={task.isDone} disabled={!canEdit || pending} onChange={e => setDone(task, e.target.checked)} aria-label={`${task.content} ${task.isDone ? "완료 해제" : "완료 처리"}`} className="mt-1 size-4 shrink-0 accent-deep-violet focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setEditor({ kind: "edit", task })} disabled={!canEdit || pending} className={cn("rounded text-left text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default", task.isDone && "text-muted-foreground line-through")}>{task.content}</button>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{task.assigneeName ?? "담당자 없음"} · {task.isDone && task.completedAt ? `${formatKoreanShortDate(task.completedAt)} 완료` : taskAttentionLabel(task, today)}{!task.isDone && task.taskStatus === "waiting" ? ` · ${task.waitingOn ?? ""} 회신 대기` : ""}</p>
      </div>
      {canEdit && <button type="button" onClick={() => setEditor({ kind: "edit", task })} disabled={pending} aria-label={`${task.content} 수정`} className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><Pencil size={15} /></button>}
    </li>)}</ul> : <p className="text-sm text-muted-foreground">등록한 할 일이 없습니다.</p>}
    {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setEditor({ kind: "create", projectId, requestId: crypto.randomUUID() })} className="gap-1.5"><Plus size={15} /> 할 일 추가</Button>}
    <p className="text-xs leading-relaxed text-muted-foreground">오늘 챙길 일과 같은 업무입니다. 확인일·마감일은 ERP 캘린더에도 표시되며, 업무 완료가 프로젝트·지급 완료를 바꾸지는 않습니다.</p>
    {editor.kind !== "closed" && <TaskEditor key={editor.kind === "create" ? editor.requestId : `${editor.task.id}-${editor.task.version}`} state={editor} projects={[{ id: projectId, name: projectName, status: projectStatus, assignee: projectAssignee }]} people={people} onClose={() => setEditor({ kind: "closed" })} />}
  </div>;
}
