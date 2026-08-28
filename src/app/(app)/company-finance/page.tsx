import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingDown, TrendingUp } from "lucide-react";
import { QUARTERS, summarizeCompanyFinance } from "@/lib/companyFinance";
import { CompanyFinanceYearNav } from "./CompanyFinanceYearNav";

function formatWon(value: number) {
  return `${value.toLocaleString()}원`;
}

function metricClass(value: number) {
  return value >= 0 ? "text-primary" : "text-destructive";
}

export default async function CompanyFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "companyFinance", session!.user.role);

  const currentYear = new Date().getFullYear();
  const parsedYear = Number.parseInt(params.year ?? "", 10);
  const year = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : currentYear;

  const projects = await prisma.project.findMany({
    where: {
      OR: [{ revenue: { not: null } }, { cost: { not: null } }],
    },
    select: { company: true, revenue: true, cost: true, createdAt: true },
  });
  const { summaries, unassigned } = summarizeCompanyFinance(projects, year);
  const totalRevenue = summaries.reduce((sum, summary) => sum + summary.revenue, 0);
  const totalCost = summaries.reduce((sum, summary) => sum + summary.cost, 0);
  const totalProfit = totalRevenue - totalCost;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">인포피아·노바웨이·클로원의 분기별 매출과 매입을 비교합니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">프로젝트에 지정된 회사와 프로젝트 생성일을 기준으로 집계합니다.</p>
        </div>
        <CompanyFinanceYearNav year={year} currentYear={currentYear} />
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription>전체 매출</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-primary">{formatWon(totalRevenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription>전체 매입</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-destructive">{formatWon(totalCost)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription>전체 순이익</CardDescription>
            <CardTitle className={`text-2xl tabular-nums ${metricClass(totalProfit)}`}>{formatWon(totalProfit)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {summaries.map((summary) => (
          <Card key={summary.company} className="shadow-xs">
            <CardHeader className="border-b border-border pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="size-4 text-primary" aria-hidden="true" />
                  {summary.company}
                </CardTitle>
                <Badge variant="outline">{summary.projectCount}개 프로젝트</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><TrendingUp size={12} className="text-primary" />매출 {formatWon(summary.revenue)}</span>
                <span className="flex items-center gap-1"><TrendingDown size={12} className="text-destructive" />매입 {formatWon(summary.cost)}</span>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="space-y-1">
                {QUARTERS.map((quarter) => {
                  const data = summary.quarters[quarter];
                  return (
                    <div key={quarter} className="grid grid-cols-[3rem_1fr_1fr_1fr] items-center gap-2 rounded-md px-2 py-2 text-xs odd:bg-muted/40">
                      <span className="font-medium text-foreground">{quarter}분기</span>
                      <span><span className="text-muted-foreground">매출 </span><span className="tabular-nums text-primary">{formatWon(data.revenue)}</span></span>
                      <span><span className="text-muted-foreground">매입 </span><span className="tabular-nums text-destructive">{formatWon(data.cost)}</span></span>
                      <span className={metricClass(data.profit)}><span className="text-muted-foreground">이익 </span><span className="tabular-nums">{formatWon(data.profit)}</span></span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
                <span>연간 합계</span>
                <span className={metricClass(summary.profit)}>{formatWon(summary.profit)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {unassigned.projectCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 shadow-xs">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="text-amber-900">회사 미지정 프로젝트 {unassigned.projectCount}건은 위 회사별 합계에서 제외했습니다. 프로젝트를 수정해 회사를 지정해 주세요.</span>
            <span className="font-medium tabular-nums text-amber-900">미지정 매출 {formatWon(unassigned.revenue)} · 매입 {formatWon(unassigned.cost)}</span>
          </CardContent>
        </Card>
      )}

      {totalRevenue === 0 && totalCost === 0 && unassigned.projectCount === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">{year}년에 회사가 지정된 매출·매입 프로젝트가 없습니다.</CardContent>
        </Card>
      )}
    </div>
  );
}
