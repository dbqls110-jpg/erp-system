import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChecklistPanel } from "./ChecklistPanel";
import { ProjectEditButton } from "./ProjectEditButton";
import { ProjectDeleteButton } from "../ProjectDeleteButton";
import { MemoEditor } from "./MemoEditor";
import { Calendar, User, Building, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: "진행 중", class: "bg-electric-blue/10 text-electric-blue border-electric-blue/20" },
  completed: { label: "완료", class: "bg-green-50 text-green-700 border-green-200" },
  on_hold: { label: "보류", class: "bg-yellow-50 text-yellow-700 border-yellow-200" },
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin";

  const project = await prisma.project.findUnique({
    where: { id },
    include: { checklistItems: { orderBy: { order: "asc" } } },
  });

  if (!project) notFound();

  const s = statusConfig[project.status] ?? statusConfig.active;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1.5 text-sm text-smoke-gray">
        <Link href="/projects" className="hover:text-midnight-charcoal transition-colors">프로젝트</Link>
        <ChevronRight size={14} className="shrink-0" />
        <span className="text-midnight-charcoal font-medium truncate max-w-xs">{project.name}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
              {project.name}
            </h1>
            <Badge variant="outline" className={s.class}>{s.label}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-smoke-gray flex-wrap">
            {project.client && <span className="flex items-center gap-1"><Building size={13} />{project.client}</span>}
            {project.assignee && <span className="flex items-center gap-1"><User size={13} />{project.assignee}</span>}
            {project.announceDate && <span className="flex items-center gap-1"><Calendar size={13} />발표 {project.announceDate}</span>}
            {project.deadline && <span className="flex items-center gap-1"><Calendar size={13} />마감 {project.deadline}</span>}
            {project.revenue != null && (
              <span className="flex items-center gap-1 text-green-600">
                <TrendingUp size={13} />매출 {project.revenue.toLocaleString()}원
              </span>
            )}
            {project.cost != null && (
              <span className="flex items-center gap-1 text-warm-fade">
                <TrendingDown size={13} />매입 {project.cost.toLocaleString()}원
              </span>
            )}
            {project.revenue != null && project.cost != null && (
              <span className={`flex items-center gap-1 font-medium ${project.revenue - project.cost >= 0 ? "text-deep-violet" : "text-destructive"}`}>
                순이익 {(project.revenue - project.cost).toLocaleString()}원
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ProjectEditButton project={project} />
          {isAdmin && <ProjectDeleteButton id={project.id} name={project.name} />}
        </div>
      </div>

      {/* 진행률 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardContent className="pt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-midnight-charcoal">전체 진행률</span>
            <span className="font-bold text-deep-violet">{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-2" />
        </CardContent>
      </Card>

      {/* 체크리스트 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            체크리스트 ({project.checklistItems.filter(i => i.isDone).length}/{project.checklistItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChecklistPanel projectId={project.id} items={project.checklistItems} />
        </CardContent>
      </Card>

      {/* 메모 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>메모</CardTitle>
        </CardHeader>
        <CardContent>
          <MemoEditor projectId={project.id} memo={project.memo} />
        </CardContent>
      </Card>
    </div>
  );
}
