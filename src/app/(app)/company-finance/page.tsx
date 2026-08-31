import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingDown, TrendingUp } from "lucide-react";
import { QUARTERS, summarizeCompanyFinanceEntries, type CompanyFinanceEntryRecord } from "@/lib/companyFinance";
import { CompanyFinanceYearNav } from "./CompanyFinanceYearNav";
import { CompanyFinanceEntryForm } from "./CompanyFinanceEntryForm";
import { CompanyFinanceEntryDeleteButton } from "./CompanyFinanceEntryDeleteButton";
import { currentKoreanDateKey } from "@/lib/dateFormat";

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
  const canEdit = await canEditMenu(session!.user.id, "companyFinance", session!.user.role);

  const currentYear = Number(currentKoreanDateKey().slice(0, 4));
  const parsedYear = Number.parseInt(params.year ?? "", 10);
  const year = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : currentYear;
  const entries = await prisma.companyFinanceEntry.findMany({
    where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, company: true, type: true, date: true, title: true, amount: true, memo: true },
  });
  const summaryEntries: CompanyFinanceEntryRecord[] = entries.flatMap((entry) => {
    if (entry.type !== "revenue" && entry.type !== "cost") return [];
    return [{ company: entry.company, type: entry.type, amount: entry.amount, date: entry.date }];
  });
  const { summaries } = summarizeCompanyFinanceEntries(summaryEntries, year);
  const totalRevenue = summaries.reduce((sum, summary) => sum + summary.revenue, 0);
  const totalCost = summaries.reduce((sum, summary) => sum + summary.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const defaultDate = year === currentYear
    ? currentKoreanDateKey()
    : `${year}-01-01`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">인포피아·노바웨이·클로원의 분기별 매출과 매입을 비교합니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">여기에 직접 등록한 회사 장부만 집계하며, 프로젝트 매출·매입은 포함하지 않습니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CompanyFinanceYearNav year={year} currentYear={currentYear} />
          {canEdit && <CompanyFinanceEntryForm defaultDate={defaultDate} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {summaries.map((summary) => (
          <Card key={summary.company} className="shadow-xs">
            <CardHeader className="border-b border-border pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="size-4 text-primary" aria-hidden="true" />
                  {summary.company}
                </CardTitle>
                <Badge variant="outline">{summary.projectCount}건</Badge>
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
                    <div key={quarter} className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] items-center gap-1 rounded-md px-2 py-2 text-xs odd:bg-muted/40">
                      <span className="font-medium text-foreground">{quarter}분기</span>
                      <span className="truncate"><span className="text-muted-foreground">매출 </span><span className="tabular-nums text-primary">{formatWon(data.revenue)}</span></span>
                      <span className="truncate"><span className="text-muted-foreground">매입 </span><span className="tabular-nums text-destructive">{formatWon(data.cost)}</span></span>
                      <span className={`truncate ${metricClass(data.profit)}`}><span className="text-muted-foreground">이익 </span><span className="tabular-nums">{formatWon(data.profit)}</span></span>
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

      <Card className="shadow-xs">
        <CardHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{year}년 등록 내역</CardTitle>
              <CardDescription className="mt-1">프로젝트와 분리된 회사 매출·매입 장부입니다.</CardDescription>
            </div>
            <Badge variant="outline">{entries.length}건</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">등록된 회사 매출·매입 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((entry) => {
                const isRevenue = entry.type === "revenue";
                return (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={isRevenue ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}>
                          {isRevenue ? "매출" : "매입"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{entry.company}</span>
                        <span className="truncate text-sm font-medium text-foreground">{entry.title}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{entry.date}{entry.memo ? ` · ${entry.memo}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold tabular-nums ${isRevenue ? "text-primary" : "text-destructive"}`}>{formatWon(entry.amount)}</span>
                      {canEdit && <CompanyFinanceEntryDeleteButton id={entry.id} title={entry.title} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">프로젝트 화면에 입력한 매출·매입은 프로젝트 손익으로만 사용됩니다.</p>
    </div>
  );
}
