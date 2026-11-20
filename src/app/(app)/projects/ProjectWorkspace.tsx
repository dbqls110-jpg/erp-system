"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search, SlidersHorizontal, BarChart2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TaskEditor, type TaskEditorState } from "@/components/projects/TaskEditor";
import { ProjectCompletionButton } from "@/components/projects/ProjectCompletionButton";
import { ProjectTaskBoard } from "@/components/projects/ProjectTaskBoard";
import { ProjectDeleteButton } from "./ProjectDeleteButton";
import { getDisplayedProjectProgress } from "@/lib/projectProgress";
import { projectFiltersHref, type ProjectListFilters } from "@/lib/projectFilters";
import { nextProjectTask, taskAttention, taskAttentionLabel, todayProjectTasks, type ProjectTask, type TaskPerson } from "@/lib/projectTaskPolicy";
import { completeProjectTaskAction } from "@/app/actions/projectTask";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { cn } from "@/lib/utils";
import { sortProjects, PROJECT_SORT_LABELS, type ProjectSort } from "@/lib/projectSort";

export type WorkspaceProject = {
  id: string; name: string; status: string; progress: number; company: string | null; client: string | null;
  deadline: string | null; assignee: string | null; workScope?: string | null; tasks: ProjectTask[];
};
export type AttentionTask = ProjectTask & { projectName: string; projectStatus: string };
const statusLabels: Record<string, string> = { active: "진행 중", completed: "완료", on_hold: "보류", all: "전체" };

export function ProjectWorkspace({ projects, attentionTasks, people, viewerId, today, canEdit, isAdmin, filters, filterControls, createControl }: {
  projects: WorkspaceProject[]; attentionTasks: AttentionTask[]; people: TaskPerson[]; viewerId: string; today: string;
  canEdit: boolean; isAdmin: boolean; filters: ProjectListFilters; filterControls: ReactNode; createControl: ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"projects" | "today" | "kanban">("projects");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [scope, setScope] = useState("mine");
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [editor, setEditor] = useState<TaskEditorState>({ kind: "closed" });
  const [pending, startTransition] = useTransition();
  useVisiblePolling(() => { if (editor.kind === "closed" && !pending) router.refresh(); }, 60_000, { immediate: false });
  const focused = todayProjectTasks(attentionTasks, today, scope === "mine" ? viewerId : null);
  const visibleTasks = showAllTasks ? focused : focused.slice(0, 5);
  const projectMap = new Map(projects.map(p => [p.id, { id: p.id, name: p.name, status: p.status }]));
  const attentionProjectNames = new Map(attentionTasks.map(task => [task.id, task.projectName]));
  for (const task of attentionTasks) if (!projectMap.has(task.projectId)) projectMap.set(task.projectId, { id: task.projectId, name: task.projectName, status: task.projectStatus });
  const options = [...projectMap.values()];
  const visibleProjects = sortProjects(projects.filter(p => `${p.name} ${p.company ?? ""} ${p.client ?? ""}`.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))), sort);
  function create(projectId = "") { setEditor({ kind: "create", projectId, requestId: crypto.randomUUID() }); }
  function edit(task: ProjectTask) { if (canEdit) setEditor({ kind: "edit", task }); }
  function complete(task: ProjectTask) {
    if (!canEdit || pending) return;
    startTransition(async () => {
      try {
        const result = await completeProjectTaskAction({ id: task.id, projectId: task.projectId, done: true, version: task.version });
        if (!result.ok) { toast.error(result.message); router.refresh(); return; }
        toast.success("업무를 완료했습니다. 프로젝트·지급 기록은 유지됩니다.");
      } catch { toast.error("저장 상태를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요."); }
    });
  }
  return <div className="space-y-9 pb-4">
    <nav aria-label="프로젝트 보기" className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
      {([["projects", "프로젝트"], ["today", "오늘 할 일"], ["kanban", "칸반"]] as const).map(([value, label]) => <Button key={value} variant={view === value ? "default" : "ghost"} aria-pressed={view === value} onClick={() => setView(value)}>{label}{value === "today" && focused.length > 0 ? ` ${focused.length}` : ""}</Button>)}
    </nav>
    {view === "today" && <section aria-labelledby="today-tasks-title" className="space-y-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="today-tasks-title" className="flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">오늘 챙길 일 <span className="rounded-lg bg-deep-violet/10 px-2.5 py-0.5 text-base tabular-nums text-rich-plum dark:text-violet-200">{focused.length}</span></h2>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="task-scope">오늘 할 일 범위</label>
          <select id="task-scope" value={scope} onChange={e => { setScope(e.target.value); setShowAllTasks(false); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="mine">내 업무</option><option value="all">전체 직원</option></select>
          {canEdit && <Button onClick={() => create()} disabled={!options.length} className="gap-1.5 bg-deep-violet text-white hover:bg-rich-plum"><Plus size={16} /> 할 일 추가</Button>}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {visibleTasks.length ? <ul className="divide-y divide-border">{visibleTasks.map(task => {
          const overdue = (taskAttention(task)?.date ?? today) < today;
          return <li key={task.id} className="flex min-h-20 items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
            <input type="checkbox" checked={false} onChange={() => complete(task)} disabled={!canEdit || pending} aria-label={`${task.content} 업무 완료`} className="size-5 shrink-0 accent-deep-violet focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />
            <button type="button" onClick={() => edit(task)} disabled={!canEdit || pending} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
              <span className="min-w-0 flex-1"><span className="block break-words text-base font-semibold leading-relaxed">{task.content}</span><span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{attentionProjectNames.get(task.id)} · {task.assigneeName ?? "담당자 없음"}</span></span>
              <span className="max-w-[42%] shrink-0 text-right text-sm sm:max-w-none"><span className={cn("block font-medium", overdue && "text-destructive")}>{taskAttentionLabel(task, today)}</span>{task.taskStatus === "waiting" && <span className="mt-1 block text-xs text-muted-foreground">{task.waitingOn ? `${task.waitingOn} 답변 대기` : "회신 대기"}</span>}</span>
              {canEdit && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-muted-foreground" />}
            </button>
          </li>;
        })}</ul> : <div className="px-5 py-7"><p className="text-sm font-medium">{scope === "mine" ? "오늘 확인할 내 업무가 없습니다." : "오늘 확인할 업무가 없습니다."}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">담당자와 확인일을 지정하면 이곳에 모입니다. 날짜 미정 업무는 프로젝트·칸반에서 확인하세요.</p></div>}
        {focused.length > 5 && <button type="button" onClick={() => setShowAllTasks(v => !v)} className="w-full border-t border-border py-3 text-sm font-medium text-rich-plum hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{showAllTasks ? "접기" : `나머지 ${focused.length - 5}개 보기`}</button>}
      </div>
    </section>}
    {view !== "today" && <section aria-labelledby="project-list-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2"><div className="flex flex-wrap items-center gap-3"><h2 id="project-list-title" className="text-xl font-semibold tracking-tight sm:text-2xl">프로젝트</h2>
          <label className="sr-only" htmlFor="workspace-project-status">프로젝트 상태</label>
          <select id="workspace-project-status" value={filters.status} onChange={e => {
            const value = e.target.value;
            if (value === "active" || value === "completed" || value === "on_hold" || value === "all") router.push(projectFiltersHref({ ...filters, status: value }), { scroll: false });
          }} className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}{filters.status === value ? ` ${projects.length}` : ""}</option>)}</select>
        </div><p className="text-sm leading-relaxed text-muted-foreground">프로젝트를 열면 견적서·파일·매출매입을 확인할 수 있습니다.</p></div>
        <div className="flex flex-wrap items-center gap-2"><label className="relative"><Search size={16} aria-hidden="true" className="absolute left-3 top-3 text-muted-foreground" /><span className="sr-only">프로젝트 검색</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="프로젝트 검색" className="h-10 w-52 max-w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>{createControl}</div>
      </div>
      <details className="rounded-lg border border-border"><summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"><SlidersHorizontal size={15} /> 필터 <span className="font-normal text-muted-foreground">회사·연도·월</span>{filters.company !== "all" || filters.period.kind !== "all" ? <span className="text-rich-plum">조건 적용 중</span> : null}</summary><div className="space-y-3 border-t border-border p-3">{filterControls}<Link href="/projects/stats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4"><BarChart2 size={15} /> 프로젝트 통계</Link></div></details>
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-muted-foreground">조회 결과 {visibleProjects.length}개</p><label className="flex items-center gap-2 text-sm text-muted-foreground">정렬<select value={sort} onChange={e => { const value = e.target.value; if (value === "recent" || value === "deadline" || value === "name") setSort(value); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(PROJECT_SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {view === "kanban" && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">프로젝트 상세와 같은 할 일입니다. 날짜 미정 업무도 표시합니다.</p>{canEdit && <Button variant="outline" onClick={() => create()} disabled={!options.length}><Plus size={16} /> 할 일 추가</Button>}</div><ProjectTaskBoard tasks={visibleProjects.flatMap(project => project.tasks.map(task => ({ ...task, projectName: project.name })))} today={today} canEdit={canEdit} onEdit={edit} /></div>}
      {view === "projects" && (visibleProjects.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProjects.map(project => {
        const next = nextProjectTask(project.tasks), progress = getDisplayedProjectProgress(project.status, project.progress);
        const allDone = project.tasks.length > 0 && project.tasks.every(t => t.isDone);
        const unassigned = project.tasks.filter(task => !task.isDone && !task.assigneeId);
        return <article key={project.id} className="flex min-w-0 flex-col rounded-xl border border-border p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 text-base font-semibold leading-relaxed"><Link href={`/projects/${project.id}`} className="break-words text-rich-plum underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:text-violet-200">{project.name}</Link></h3><div className="flex shrink-0 items-center gap-1"><span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{statusLabels[project.status] ?? "확인 필요"}</span>{isAdmin && <ProjectDeleteButton id={project.id} name={project.name} />}</div></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{project.company ?? "회사 미배정"}{project.assignee ? ` · ${project.assignee}` : ""}</p>
          {project.client && <p className="mt-1 truncate text-xs text-muted-foreground">{project.client}</p>}
          {project.status !== "completed" && (!project.workScope?.trim() || !project.tasks.some(task => !task.id.startsWith("reminder-"))) && <Link href={`/projects/${project.id}#project-scope`} className="mt-2 text-sm font-medium text-destructive underline-offset-4 hover:underline">● 과업 미등록 · 업무 범위와 할 일 등록</Link>}
          <div className="mb-4 mt-4 flex items-center gap-3"><Progress value={progress} aria-label={`${project.name} 진행률`} className="flex-1 [&_[data-slot=progress-indicator]]:bg-deep-violet" /><span className="text-xs tabular-nums text-muted-foreground">{progress}%</span></div>
          <div className="mt-auto border-t border-border pt-3">{next ? <div className="space-y-1.5"><button type="button" onClick={() => edit(next)} disabled={!canEdit} className="w-full rounded text-left text-sm leading-relaxed hover:text-rich-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"><span className="mr-2 text-muted-foreground">다음 할 일</span><span className="font-medium">{next.content}</span></button><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className={next.assigneeId ? "text-muted-foreground" : "font-medium text-amber-800 dark:text-amber-200"}>{next.assigneeId ? next.assigneeName ?? "담당자 이름 미등록" : "담당자 없음"}</span><span className={cn("text-muted-foreground", (taskAttention(next)?.date ?? today) < today && "font-medium text-destructive")}>{taskAttentionLabel(next, today)}</span></div></div>
            : allDone || project.status === "completed" ? <p className="text-sm text-muted-foreground">등록한 할 일 완료</p>
            : canEdit ? <button type="button" onClick={() => create(project.id)} className="rounded text-sm font-medium text-amber-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:text-amber-200">다음 할 일 등록</button>
            : <p className="text-sm text-muted-foreground">다음 할 일이 없습니다.</p>}
            {next?.assigneeId && unassigned[0] && <button type="button" disabled={!canEdit} onClick={() => edit(unassigned[0])} className="mt-2 rounded text-left text-xs font-medium text-amber-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default dark:text-amber-200">담당자 없는 업무 {unassigned.length}개</button>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{project.deadline ? `마감 ${project.deadline}` : "마감일 미정"}</span>{canEdit && <ProjectCompletionButton projectId={project.id} name={project.name} status={project.status} />}</div>
        </article>;
      })}</div> : <p className="rounded-xl border border-border px-5 py-10 text-sm text-muted-foreground">선택한 조건에 맞는 프로젝트가 없습니다. 검색어나 필터를 변경해 주세요.</p>)}
    </section>}
    {editor.kind !== "closed" && <TaskEditor key={editor.kind === "create" ? editor.requestId : `${editor.task.id}-${editor.task.version}`} state={editor} projects={options} people={people} defaultAssigneeId={viewerId} onClose={() => setEditor({ kind: "closed" })} />}
  </div>;
}
