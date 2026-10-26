import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getDisplayedProjectProgress } from "@/lib/projectProgress";
import type { ExternalProject } from "@/lib/projectVisibility";

function ProjectSummary({ project }: { project: ExternalProject }) {
  const progress = getDisplayedProjectProgress(project.status, project.progress);
  const status = ({ active: "진행 중", completed: "완료", on_hold: "보류" } as Record<string, string>)[project.status] ?? "확인 필요";
  return <Card>
    <CardHeader><CardTitle>{project.name}</CardTitle><Badge variant="outline">{status}</Badge></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm">진행률 {progress}%</p><Progress value={progress} />
      {project.deadline && <p className="text-sm">마감 {project.deadline}</p>}
      {project.announceDate && <p className="text-sm">발표 {project.announceDate}</p>}
    </CardContent>
  </Card>;
}

export function ExternalProjectList({ projects, filter, controls }: { projects: ExternalProject[]; filter: React.ReactNode; controls?: React.ReactNode }) {
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p>참여 중인 프로젝트 현황</p>{filter}</div>
    {controls}
    <p className="text-xs text-muted-foreground" role="status">조회 결과 {projects.length}개</p>
    {projects.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map(project => <Link href={`/projects/${project.id}`} key={project.id}><ProjectSummary project={project} /></Link>)}
    </div> : <p className="text-sm text-muted-foreground">선택한 조건에 맞는 연결된 프로젝트가 없습니다.</p>}
  </div>;
}
