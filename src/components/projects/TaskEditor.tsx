"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveProjectTaskAction, deleteProjectTaskAction } from "@/app/actions/projectTask";
import { TASK_STATUS_LABELS, type OpenTaskStatus, type ProjectTask, type TaskPerson, type TaskProject } from "@/lib/projectTaskPolicy";

const selectClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
export type TaskEditorState = { kind: "closed" } | { kind: "create"; projectId: string; requestId: string } | { kind: "edit"; task: ProjectTask };

export function TaskEditor({ state, projects, people, defaultAssigneeId, onClose }: {
  state: Exclude<TaskEditorState, { kind: "closed" }>; projects: TaskProject[]; people: TaskPerson[]; defaultAssigneeId?: string; onClose: () => void;
}) {
  const router = useRouter();
  const task = state.kind === "edit" ? state.task : null;
  const [projectId, setProjectId] = useState(task?.projectId ?? (state.kind === "create" ? state.projectId : ""));
  const [content, setContent] = useState(task?.content ?? "");
  const [assigneeId, setAssigneeId] = useState(task ? task.assigneeId ?? "" : people.some(p => p.id === defaultAssigneeId) ? defaultAssigneeId ?? "" : "");
  const [status, setStatus] = useState<OpenTaskStatus>(task?.taskStatus === "waiting" ? "waiting" : task?.taskStatus === "in_progress" ? "in_progress" : "todo");
  const [nextCheckDate, setNextCheckDate] = useState(task?.nextCheckDate ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [waitingOn, setWaitingOn] = useState(task?.waitingOn ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    startTransition(async () => {
      try {
      const result = await saveProjectTaskAction({ projectId, content, assigneeId, taskStatus: status, nextCheckDate, dueDate, waitingOn },
        state.kind === "create" ? { kind: "create", requestId: state.requestId } : { kind: "edit", id: state.task.id, version: state.task.version });
      if (!result.ok) { setError(result.message); router.refresh(); return; }
      toast.success("업무를 저장했습니다."); onClose();
      } catch { setError("저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요."); }
    });
  }
  function remove() {
    if (!task || !window.confirm(`“${task.content}” 업무를 삭제할까요?`)) return;
    startTransition(async () => {
      try {
      const result = await deleteProjectTaskAction({ id: task.id, projectId: task.projectId, version: task.version });
      if (!result.ok) { setError(result.message); router.refresh(); return; }
      toast.success("업무를 삭제했습니다."); onClose();
      } catch { setError("삭제 결과를 확인하지 못했습니다. 새로고침 후 확인해 주세요."); }
    });
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>{task ? "할 일 수정" : "할 일 추가"}</DialogTitle>
        <DialogDescription>한 번 저장하면 프로젝트와 오늘 챙길 일에 함께 반영됩니다.</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="task-project">프로젝트</Label>
          <select id="task-project" value={projectId} onChange={e => setProjectId(e.target.value)} required disabled={pending || Boolean(task)} className={selectClass}>
            <option value="">프로젝트 선택</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="task-content">할 일</Label>
          <Input id="task-content" value={content} onChange={e => setContent(e.target.value)} maxLength={300} required autoFocus disabled={pending} placeholder="예: 최종 시안 회신 확인" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="task-assignee">담당자</Label>
            <select id="task-assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} disabled={pending} className={selectClass}>
              <option value="">미지정</option>
              {task?.assigneeId && !people.some(p => p.id === task.assigneeId) && <option value={task.assigneeId} disabled>{task.assigneeName ?? "기존 담당자"} (다시 지정 필요)</option>}
              {people.map(p => <option key={p.id} value={p.id}>{p.name ?? "이름 미등록"}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="task-status">상태</Label>
            <select id="task-status" value={status} onChange={e => { if (e.target.value === "todo" || e.target.value === "in_progress" || e.target.value === "waiting") setStatus(e.target.value); }} disabled={pending} className={selectClass}>
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        {status === "waiting" && <div className="space-y-1.5"><Label htmlFor="task-waiting">대기 상대 <span className="text-muted-foreground">(선택)</span></Label>
          <Input id="task-waiting" value={waitingOn} onChange={e => setWaitingOn(e.target.value)} maxLength={120} placeholder="예: 고객 / 인쇄 업체" disabled={pending} />
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="task-check">다음 확인일 <span className="text-muted-foreground">(선택)</span></Label>
            <Input id="task-check" name="nextCheckDate" type="date" min="2000-01-01" max="2100-12-31" value={nextCheckDate} onInput={e => setNextCheckDate(e.currentTarget.value)} onChange={e => setNextCheckDate(e.target.value)} disabled={pending} />
          </div>
          <div className="space-y-1.5"><Label htmlFor="task-due">업무 마감일 <span className="text-muted-foreground">(선택)</span></Label>
            <Input id="task-due" name="dueDate" type="date" min="2000-01-01" max="2100-12-31" value={dueDate} onInput={e => setDueDate(e.currentTarget.value)} onChange={e => setDueDate(e.target.value)} disabled={pending} />
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">날짜를 지정하면 ERP 캘린더에도 표시됩니다. 모르는 날짜는 비워 두세요. 같은 날의 확인·마감은 한 일정으로 표시됩니다.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {task ? <Button type="button" variant="ghost" onClick={remove} disabled={pending} className="text-destructive">업무 삭제</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>취소</Button><Button type="submit" disabled={pending || !content.trim() || !projectId}>{pending ? "저장 중…" : "업무 저장"}</Button></div>
        </div>
      </form>
      {task && <Link href={`/projects/${task.projectId}#project-tasks`} className="text-sm text-primary underline underline-offset-4">기존 프로젝트 상세 열기</Link>}
    </DialogContent>
  </Dialog>;
}
