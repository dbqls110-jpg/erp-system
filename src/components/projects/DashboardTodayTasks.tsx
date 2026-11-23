import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { projectTaskPreview, todayTaskGroup, todayTaskLabel, type ProjectTask } from "@/lib/projectTaskPolicy";
import { cn } from "@/lib/utils";

export function DashboardTodayTasks({ tasks, today }: {
  tasks: readonly (ProjectTask & { projectName: string })[];
  today: string;
}) {
  const preview = projectTaskPreview(tasks);
  return (
    <Card className="gap-0 rounded-xl border-border py-0 shadow-none">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5">
        <CardTitle className="text-sm font-semibold">오늘 챙길 일 <span className="ml-1 tabular-nums text-muted-foreground">({preview.total}건)</span></CardTitle>
        <Link href="/projects?view=today" className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          {preview.total > 0 ? `전체 ${preview.total}건 보기` : "오늘 할 일 보기"} <span aria-hidden="true">→</span>
        </Link>
      </CardHeader>
      <CardContent className="px-4 py-0">
        {preview.tasks.length ? <ul className="divide-y divide-border">
          {preview.tasks.map(task => (
            <li key={task.id}>
              <Link href={`/projects/${task.projectId}#task-${task.id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-sm py-2.5 text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <span className="min-w-0 break-words font-medium">{task.content}</span>
                <span className="min-w-0 break-words text-muted-foreground">{task.projectName}</span>
                <span className={cn("ml-auto shrink-0 text-xs font-medium", todayTaskGroup(task, today) === "overdue" ? "text-destructive" : "text-muted-foreground")}>{todayTaskLabel(task, today)}</span>
              </Link>
            </li>
          ))}
        </ul> : <p className="py-4 text-sm text-muted-foreground">오늘 챙길 내 업무가 없습니다.</p>}
      </CardContent>
    </Card>
  );
}
