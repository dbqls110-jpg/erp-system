import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChecklistPanel } from "./ChecklistPanel";
import { ProjectLinksPanel } from "./ProjectLinksPanel";
import { ProjectEditButton } from "./ProjectEditButton";
import { ProjectDeleteButton } from "../ProjectDeleteButton";
import { MemoEditor } from "./MemoEditor";
import { ProjectFilesPanel } from "./ProjectFilesPanel";
import { ProjectAmountsPanel } from "./ProjectAmountsPanel";
import { Calendar, User, Building, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";
import { calculateNetIncome, calculateOperatingProfit } from "@/lib/financeMetrics";
import { toneBadgeClass } from "@/lib/badge-tone";

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: "진행 중", class: toneBadgeClass("blue") },
  completed: { label: "완료", class: toneBadgeClass("green") },
  on_hold: { label: "보류", class: toneBadgeClass("amber") },
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "projects", session!.user.role);
  const canEdit = await canEditMenu(session!.user.id, "projects", session!.user.role);
  const isAdmin = session?.user?.role === "admin";

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      checklistItems: { orderBy: { order: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      amounts: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] },
      customers: { include: { customer: { select: { id: true, name: true } } } },
      partners: { include: { partner: { select: { id: true, name: true } } } },
    },
  });

  if (!project) notFound();

  // 연결 후보 목록. 목록이 커지면 검색형으로 바꾼다.
  const [allCustomers, allPartners] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const s = statusConfig[project.status] ?? statusConfig.active;
  const operatingProfit = calculateOperatingProfit(project.revenue, project.cost);
  const netIncome = calculateNetIncome(project.revenue, project.cost);

  return (
    <div className="space-y-4">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors">프로젝트</Link>
        <ChevronRight size={14} className="shrink-0" />
        <span className="text-foreground font-medium truncate max-w-xs">{project.name}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground shadow-none">
            <Badge variant="outline" className={s.class}>{s.label}</Badge>
            {project.client && <span className="flex items-center gap-1"><Building size={13} />{project.client}</span>}
            {project.company && <span className="flex items-center gap-1"><Building size={13} />귀속 회사 {project.company}</span>}
            {project.assignee && <span className="flex items-center gap-1"><User size={13} />{project.assignee}</span>}
            {project.deadline && <span className="flex items-center gap-1"><Calendar size={13} />마감 {project.deadline}</span>}
            {project.revenue != null && (
              <span className="flex items-center gap-1 text-[#15803d] dark:text-emerald-400">
                <TrendingUp size={13} />매출 {project.revenue.toLocaleString()}원
              </span>
            )}
            {project.cost != null && (
              <span className="flex items-center gap-1 text-destructive">
                <TrendingDown size={13} />매입 {project.cost.toLocaleString()}원
              </span>
            )}
            {operatingProfit !== null && (
                <span className={`flex items-center gap-1 font-medium ${operatingProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                영업이익 {operatingProfit.toLocaleString()}원
              </span>
            )}
            {netIncome !== null && (
              <span className={`flex items-center gap-1 font-medium ${netIncome >= 0 ? "text-primary" : "text-destructive"}`}>
                당기순이익 {netIncome.toLocaleString()}원
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && <ProjectEditButton project={project} />}
          {isAdmin && <ProjectDeleteButton id={project.id} name={project.name} />}
        </div>
      </div>

      {/* 넓은 화면에서는 두 열. 왼쪽 요약·매출매입·업무, 오른쪽 파일·메모 — docs/design-A/project-detail.html.
          한 열로 두면 1920 화면에서 오른쪽 절반이 빈다. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
      {/* 진행률 */}
      <Card className="rounded-[12px] border border-border py-0 shadow-none">
        <CardContent className="px-4 py-3.5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-foreground">전체 진행률</span>
            <span className="font-bold text-primary">{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-2" />
        </CardContent>
      </Card>

      {/* 매출 · 매입 건별 관리 */}
      <Card className="rounded-[12px] border border-border py-0 shadow-none">
        <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
          <CardTitle className="text-[14px] font-semibold text-foreground">
            매출 · 매입
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <ProjectAmountsPanel projectId={project.id} amounts={project.amounts} canEdit={canEdit} />
        </CardContent>
      </Card>

      {/* 거래처 · 파트너 연결 */}
      <Card className="rounded-[12px] border border-border py-0 shadow-none">
        <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
          <CardTitle className="text-[14px] font-semibold text-foreground">
            거래처 · 파트너
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <ProjectLinksPanel
            projectId={project.id}
            customers={project.customers.map((pc) => pc.customer)}
            partners={project.partners.map((pp) => pp.partner)}
            allCustomers={allCustomers}
            allPartners={allPartners}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {/* 체크리스트 */}
      <Card className="rounded-[12px] border border-border py-0 shadow-none">
        <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-[14px] font-semibold text-foreground">
            체크리스트 ({project.checklistItems.filter(i => i.isDone).length}/{project.checklistItems.length})
            </CardTitle>
            <Progress value={project.checklistItems.length === 0 ? 0 : (project.checklistItems.filter(i => i.isDone).length / project.checklistItems.length) * 100} className="w-36 shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <ChecklistPanel projectId={project.id} items={project.checklistItems} canEdit={canEdit} />
        </CardContent>
      </Card>

        </div>
        <div className="space-y-4">
      {/* 파일 */}
      <Card className="rounded-[12px] border border-border py-0 shadow-none">
        <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
          <CardTitle className="text-[14px] font-semibold text-foreground">
            파일 ({project.files.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <ProjectFilesPanel projectId={project.id} files={project.files} canEdit={canEdit} />
        </CardContent>
      </Card>

      {/* 메모 */}
      <Card className="rounded-[12px] border border-border py-0 shadow-none">
        <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
          <CardTitle className="text-[14px] font-semibold text-foreground">메모</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <MemoEditor projectId={project.id} memo={project.memo} canEdit={canEdit} />
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
