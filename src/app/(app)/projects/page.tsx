import { getServerSession } from "next-auth";
import { requireMenuAccess } from "@/lib/permissions";
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

  const whereStatus = currentFilter === "all" ? {} : { status: currentFilter };
  // 권한 검사가 실패하면 JSX를 반환하지 않으므로 프로젝트 목록을 함께 조회해도 응답에 포함되지 않는다.
  const [, projects] = await Promise.all([
    requireMenuAccess(session!.user.id, "projects", session!.user.role),
    prisma.project.findMany({
      where: whereStatus,
      include: { _count: { select: { checklistItems: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">프로젝트 현황과 진행률을 확인하세요</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ProjectFilter current={currentFilter} />
          <Link href="/projects/stats" className="flex h-9 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors border border-border rounded-lg px-3 py-2">
            <BarChart2 className="size-3.5" /> 통계
          </Link>
          <ProjectCreateButton />
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderOpen className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {currentFilter === "all" ? "등록된 프로젝트가 없습니다" : `${({ active: "진행 중", completed: "완료", on_hold: "보류" } as Record<string, string>)[currentFilter]} 프로젝트가 없습니다`}
              </p>
              <p className="text-sm text-muted-foreground">새 프로젝트를 추가해 보세요</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const s = statusConfig[p.status] ?? statusConfig.active;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="shadow-xs hover:shadow-sm transition-shadow cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold text-foreground line-clamp-1" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
                        {p.name}
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className={s.class}>{s.label}</Badge>
                        {isAdmin && <ProjectDeleteButton id={p.id} name={p.name} />}
                      </div>
                    </div>
                    {p.client && <p className="text-sm text-muted-foreground">{p.client}</p>}
                    {p.company && <p className="text-xs text-primary">귀속 회사 · {p.company}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>진행률</span>
                        <span>{p.progress}%</span>
                      </div>
                      <Progress value={p.progress} className="h-1.5" />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
