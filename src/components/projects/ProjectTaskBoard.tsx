"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeProjectTaskAction, saveProjectTaskAction } from "@/app/actions/projectTask";
import { TASK_STATUS_LABELS, taskAttentionLabel, type ProjectTask } from "@/lib/projectTaskPolicy";

export type BoardTask = ProjectTask & { projectName: string };
export function ProjectTaskBoard({ tasks, today, canEdit, onEdit }: {
  tasks: BoardTask[]; today: string; canEdit: boolean; onEdit: (task: ProjectTask) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const columns = [...Object.entries(TASK_STATUS_LABELS), ["done", "완료"]];
  function change(task: BoardTask, value: string) {
    if (pending || !canEdit) return;
    startTransition(async () => {
      try {
        const result = value === "done" || task.isDone
          ? await completeProjectTaskAction({ id: task.id, projectId: task.projectId, done: value === "done", version: task.version })
          : await saveProjectTaskAction({ ...task, taskStatus: value }, { kind: "edit", id: task.id, version: task.version });
        if (!result.ok) toast.error(result.message);
        else toast.success(value === "done" ? "업무를 완료했습니다." : task.isDone ? "완료를 취소했습니다." : "업무 상태를 변경했습니다.");
      } catch { toast.error("변경 결과를 확인하지 못했습니다. 새로고침 후 확인해 주세요."); }
      router.refresh();
    });
  }
  return <div aria-label="업무 칸반" aria-busy={pending} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {columns.map(([status, label]) => {
      const rows = tasks.filter(task => (task.isDone ? "done" : task.taskStatus) === status);
      return <section key={status} aria-label={`${label} 업무`} className="min-w-0 rounded-xl bg-muted/50 p-3">
        <h3 className="mb-3 flex items-center justify-between gap-2 px-1 text-sm font-semibold">{label}<span className="tabular-nums text-muted-foreground">{rows.length}</span></h3>
        <ul className="space-y-3">{rows.map(task => <li key={task.id} className="min-w-0 rounded-lg border border-border bg-background p-3">
          <Link href={`/projects/${task.projectId}`} className="block break-words text-xs font-medium text-rich-plum underline-offset-4 hover:underline dark:text-violet-200">{task.projectName}</Link>
          <button type="button" onClick={() => onEdit(task)} disabled={!canEdit || pending} className="mt-2 block w-full break-words rounded text-left text-sm font-semibold leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">{task.content}</button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{task.assigneeName ?? "담당자 없음"} · {taskAttentionLabel(task, today)}</p>
          {task.taskStatus === "waiting" && task.waitingOn && <p className="mt-1 break-words text-xs text-muted-foreground">{task.waitingOn} 회신 대기</p>}
          {canEdit && <div className="mt-3">
            {task.isDone ? <Button variant="outline" size="sm" disabled={pending} onClick={() => change(task, task.taskStatus)}>완료 취소</Button> : <label className="block text-xs text-muted-foreground">상태 변경<select aria-label={`${task.content} 상태 변경`} disabled={pending} value={task.taskStatus} onChange={event => change(task, event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">{columns.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
          </div>}
        </li>)}</ul>
        {!rows.length && <p className="py-5 text-center text-sm text-muted-foreground">등록된 업무 없음</p>}
      </section>;
    })}
  </div>;
}
