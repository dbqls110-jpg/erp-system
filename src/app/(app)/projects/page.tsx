import { getServerSession } from "next-auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { ProjectCreateButton } from "./ProjectCreateButton";
import { ProjectDeleteButton } from "./ProjectDeleteButton";
import { ProjectFilter } from "./ProjectFilter";
import { Calendar, User, FolderOpen, BarChart2 } from "lucide-react";
import { toneBadgeClass } from "@/lib/badge-tone";
import { getCalendarViewer } from "@/lib/calendarViewer";
import { canViewLinkedProjects, projectWhereForViewer } from "@/lib/projectVisibility";

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: "진행 중", class: toneBadgeClass("blue") },
  completed: { label: "완료", class: toneBadgeClass("green") },
  on_hold: { label: "보류", class: toneBadgeClass("amber") },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const currentFilter = ["active", "completed", "on_hold"].includes(status ?? "") ? status! : "all";

  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin";
  const viewer = await getCalendarViewer();
  const linkedExternal = canViewLinkedProjects(viewer);
  if (!linkedExternal) {
    await requireMenuAccess(session!.user.id, "projects", session!.user.role);
  }
  // 외부 연결 계정은 연결된 프로젝트를 읽기 전용으로만 본다.
  const canEdit = linkedExternal ? false : await canEditMenu(session!.user.id, "projects", session!.user.role);

  const whereStatus = currentFilter === "all" ? {} : { status: currentFilter };
  const projects = await prisma.project.findMany({
      where: { ...whereStatus, AND: [projectWhereForViewer(viewer)] },
      include: { _count: { select: { checklistItems: true } } },
      orderBy: { createdAt: "desc" },
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">프로젝트 현황과 진행률을 확인하세요</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ProjectFilter current={currentFilter} />
          {!linkedExternal && (
            <Link href="/projects/stats" className="flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <BarChart2 className="size-3.5" /> 통계
            </Link>
          )}
          {canEdit && <ProjectCreateButton />}
        </div>
      </div>

      {projects.length === 0 ? (
          <Card className="rounded-[12px] border border-border py-0 shadow-none">
          <CardContent className="px-4">
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderOpen className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {linkedExternal
                  ? "연결된 파트너·거래처 프로젝트가 없습니다"
                  : currentFilter === "all"
                    ? "등록된 프로젝트가 없습니다"
                    : `${({ active: "진행 중", completed: "완료", on_hold: "보류" } as Record<string, string>)[currentFilter]} 프로젝트가 없습니다`}
              </p>
              {!linkedExternal && <p className="text-sm text-muted-foreground">새 프로젝트를 추가해 보세요</p>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const s = statusConfig[p.status] ?? statusConfig.active;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="h-full rounded-[12px] border border-border py-0 shadow-none transition-all hover:border-[#d8d4fb] hover:shadow-sm">
                  <CardHeader className="gap-[6px] px-[18px] pb-3 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-1 text-[14px] font-semibold text-foreground">
                        {p.name}
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className={s.class}>{s.label}</Badge>
                        {isAdmin && <ProjectDeleteButton id={p.id} name={p.name} />}
                      </div>
                    </div>
                    {p.client && <p className="text-[12px] text-muted-foreground">{p.client}</p>}
                    {p.company && <p className="text-[11.5px] text-primary">귀속 회사 · {p.company}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3 px-[18px] pb-4">
                    <div>
                      <div className="mb-1 flex justify-between text-[12px] text-muted-foreground">
                        <span>진행률</span>
                        <span>{p.progress}%</span>
                      </div>
                      <Progress value={p.progress} className="h-1.5" />
                    </div>
                    <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
                      {p.deadline && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} /> 마감 {p.deadline}
                        </span>
                      )}
                      {p.assignee && (
                        <span className="flex items-center gap-1">
                          <User size={11} /> {p.assignee}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
