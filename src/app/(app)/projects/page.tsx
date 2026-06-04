import { getServerSession } from "next-auth";
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

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: "진행 중", class: "bg-electric-blue/10 text-electric-blue border-electric-blue/20" },
  completed: { label: "완료", class: "bg-green-50 text-green-700 border-green-200" },
  on_hold: { label: "보류", class: "bg-yellow-50 text-yellow-700 border-yellow-200" },
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
  const projects = await prisma.project.findMany({
    where: whereStatus,
    include: { _count: { select: { checklistItems: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          프로젝트
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ProjectFilter current={currentFilter} />
          <Link href="/projects/stats" className="flex items-center gap-1.5 text-sm font-medium text-smoke-gray hover:text-deep-violet transition-colors border border-ash-gray rounded-lg px-3 py-2">
            <BarChart2 size={15} /> 통계
          </Link>
          <ProjectCreateButton />
        </div>
      </div>

      {projects.length === 0 ? (
        <Card className="border-ash-gray">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <FolderOpen size={40} className="text-ash-gray" />
            <p className="text-sm font-medium text-midnight-charcoal">
              {currentFilter === "all" ? "등록된 프로젝트가 없습니다" : `${({ active: "진행 중", completed: "완료", on_hold: "보류" } as Record<string, string>)[currentFilter]} 프로젝트가 없습니다`}
            </p>
            <p className="text-xs text-smoke-gray">새 프로젝트를 추가해 보세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const s = statusConfig[p.status] ?? statusConfig.active;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="border-ash-gray shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-subtle)] transition-shadow cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold text-deep-space-charcoal line-clamp-1" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
                        {p.name}
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className={`text-xs ${s.class}`}>{s.label}</Badge>
                        {isAdmin && <ProjectDeleteButton id={p.id} name={p.name} />}
                      </div>
                    </div>
                    {p.client && <p className="text-sm text-smoke-gray">{p.client}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-smoke-gray mb-1">
                        <span>진행률</span>
                        <span>{p.progress}%</span>
                      </div>
                      <Progress value={p.progress} className="h-1.5" />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-smoke-gray">
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
