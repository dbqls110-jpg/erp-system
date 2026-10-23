import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingDown, TrendingUp } from "lucide-react";
import {
  QUARTERS,
  summarizeCompanyFinanceRecords,
  type CompanyFinanceRecord,
} from "@/lib/companyFinance";
import { companyFinanceFilterLabel, companyFinanceWhere, parseCompanyFinanceFilters, type CompanyFinanceSearchParams } from "@/lib/companyFinanceFilters";
import { CompanyFinanceFilters } from "./CompanyFinanceFilters";
import { CompanyFinanceYearNav } from "./CompanyFinanceYearNav";
import { CompanyFinanceEntryForm } from "./CompanyFinanceEntryForm";
import { CompanyFinanceEntryDeleteButton } from "./CompanyFinanceEntryDeleteButton";
import { currentKoreanDateKey, koreanDateKey } from "@/lib/dateFormat";
import { toneBadgeClass } from "@/lib/badge-tone";

function formatWon(value: number) {
  return `${value.toLocaleString()}원`;
}

function metricClass(value: number) {
  return value >= 0 ? "text-primary" : "text-destructive";
}

export default async function CompanyFinancePage({
  searchParams,
}: {
  searchParams: Promise<CompanyFinanceSearchParams>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);

  const currentYear = Number(currentKoreanDateKey().slice(0, 4));
  const filters = parseCompanyFinanceFilters(params, currentYear);
  const { year, month, company } = filters;
  const where = companyFinanceWhere(filters);
  const filterLabel = companyFinanceFilterLabel(filters);
  // 조회 필터는 권한이 아니다. 재무 권한을 먼저 확인한 뒤 두 장부를 병렬 조회한다.
  await requireMenuAccess(session!.user.id, "companyFinance", session!.user.role);
  const [canEdit, entries, projectAmounts] = await Promise.all([
    canEditMenu(session!.user.id, "companyFinance", session!.user.role),
    prisma.companyFinanceEntry.findMany({
      where: where.entries,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, company: true, type: true, date: true, title: true, amount: true, memo: true },
    }),
    prisma.projectAmount.findMany({
      where: where.projectAmounts,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        projectId: true,
        kind: true,
        amount: true,
        label: true,
        memo: true,
        createdAt: true,
        project: { select: { name: true, company: true } },
      },
    }),
  ]);
  const displayItems = [
    ...entries
      .filter((entry) => entry.type === "revenue" || entry.type === "cost" || entry.type === "card")
      .map((entry) => ({
        source: "entry" as const,
        id: entry.id,
        company: entry.company,
        type: entry.type,
        amount: entry.amount,
        dateKey: entry.date,
        title: entry.title,
        memo: entry.memo,
      })),
    ...projectAmounts
      .filter((amount) => amount.kind === "revenue" || amount.kind === "cost")
      .map((amount) => ({
        source: "project" as const,
        id: amount.id,
        projectId: amount.projectId,
        projectName: amount.project.name,
        company: amount.project.company,
        type: amount.kind,
        amount: amount.amount,
        dateKey: koreanDateKey(amount.createdAt),
        title: amount.label,
        memo: amount.memo,
      })),
  ].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  // 카드 합계와 상세 내역이 서로 다른 자료를 집계하지 않도록 같은 목록에서 계산한다.
  const summaryRecords: CompanyFinanceRecord[] = displayItems.map((item) => ({
    company: item.company,
    type: item.type as CompanyFinanceRecord["type"],
    amount: item.amount,
    date: item.dateKey,
  }));
  const { summaries: allSummaries, unassigned } = summarizeCompanyFinanceRecords(summaryRecords, year);
  const summaries = allSummaries.filter((summary) => company === "all" || summary.company === company);
  const totalRevenue = summaries.reduce((sum, summary) => sum + summary.revenue, 0) + unassigned.revenue;
  const totalCost = summaries.reduce((sum, summary) => sum + summary.cost, 0) + unassigned.cost;
  const totalCard = summaries.reduce((sum, summary) => sum + summary.card, 0) + unassigned.card;
  const totalProfit = totalRevenue - totalCost - totalCard;
  const visibleQuarters = month === null ? QUARTERS : QUARTERS.filter((quarter) => quarter === Math.ceil(month / 3));
  const defaultDate = year === currentYear
    ? currentKoreanDateKey()
    : `${year}-01-01`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">회사별·월별 매출·매입·카드값과 순이익을 조회합니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">프로젝트에 넣은 매출·매입은 자동으로 들어옵니다. 여기에 또 넣으면 두 번 셉니다. 카드값은 매입 합계에서 제외하고 순이익에서만 차감합니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">조회 날짜 기준: 회사 장부는 발생일, 프로젝트 금액은 금액 등록일(한국시간)입니다. 견적서 작성일·행사일 기준이 아닙니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CompanyFinanceYearNav filters={filters} currentYear={currentYear} />
          {canEdit && <CompanyFinanceEntryForm defaultDate={defaultDate} />}
        </div>
      </div>

      <CompanyFinanceFilters filters={filters} currentYear={currentYear} />
      <p className="text-sm font-medium" role="status">{filterLabel} · {displayItems.length}건</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[12px] border border-border py-0 shadow-none">
          <CardHeader className="gap-[6px] px-[18px] py-4">
            <CardDescription className="text-[12px]">조회 매출 합계</CardDescription>
            <CardTitle className="text-[26px] font-bold leading-tight tracking-[-0.01em] tabular-nums text-primary" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{formatWon(totalRevenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-[12px] border border-border py-0 shadow-none">
          <CardHeader className="gap-[6px] px-[18px] py-4">
            <CardDescription className="text-[12px]">조회 매입 합계</CardDescription>
            <CardTitle className="text-[26px] font-bold leading-tight tracking-[-0.01em] tabular-nums text-destructive" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{formatWon(totalCost)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-[12px] border border-border py-0 shadow-none">
          <CardHeader className="gap-[6px] px-[18px] py-4">
            <CardDescription className="text-[12px]">카드값 · 매입 미포함</CardDescription>
            <CardTitle className="text-[26px] font-bold leading-tight tracking-[-0.01em] tabular-nums text-destructive" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{formatWon(totalCard)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-[12px] border border-border py-0 shadow-none">
          <CardHeader className="gap-[6px] px-[18px] py-4">
            <CardDescription className="text-[12px]">순이익 (카드값 차감 후)</CardDescription>
            <CardTitle className={`text-[26px] font-bold leading-tight tracking-[-0.01em] tabular-nums ${metricClass(totalProfit)}`} style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{formatWon(totalProfit)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {summaries.map((summary) => (
          <Card key={summary.company} className="rounded-[12px] border border-border py-0 shadow-none">
            <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
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
                <span className="flex items-center gap-1"><TrendingDown size={12} className="text-amber-600" />카드값 {formatWon(summary.card)}</span>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="space-y-1">
                {visibleQuarters.map((quarter) => {
                  const data = summary.quarters[quarter];
                  return (
                    <div key={quarter} className="grid grid-cols-[4rem_repeat(4,minmax(0,1fr))] items-center gap-1 rounded-md px-2 py-2 text-xs odd:bg-muted/40">
                      <span className="font-medium text-foreground">{month === null ? `${quarter}분기` : `${month}월`}</span>
                      <span className="truncate"><span className="text-muted-foreground">매출 </span><span className="tabular-nums text-primary">{formatWon(data.revenue)}</span></span>
                      <span className="truncate"><span className="text-muted-foreground">매입 </span><span className="tabular-nums text-destructive">{formatWon(data.cost)}</span></span>
                      <span className="truncate"><span className="text-muted-foreground">카드 </span><span className="tabular-nums text-amber-700 dark:text-amber-300">{formatWon(data.card)}</span></span>
                      <span className={`truncate ${metricClass(data.profit)}`}><span className="text-muted-foreground">이익 </span><span className="tabular-nums">{formatWon(data.profit)}</span></span>
                    </div>
                  );
                })}
              </div>
              {/* 위 분기 행과 같은 좌우 여백(px-2)을 줘야 왼쪽 글자와 오른쪽 숫자 열이 맞는다.
                  글자 크기도 분기 행(12px)에 맞추고 금액만 굵게 — 줄 하나만 커지면 떠 보인다. */}
              <div className="mt-2 flex items-baseline justify-between border-t border-border px-2 pt-2.5 text-xs">
                <span className="font-medium text-muted-foreground">{month === null ? "연간 합계" : `${month}월 합계`}</span>
                <span className={`text-sm font-bold tabular-nums ${metricClass(summary.profit)}`} style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{formatWon(summary.profit)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {(unassigned.projectCount > 0 || company === "unassigned") && (
          <Card className="shadow-xs">
            <CardHeader className="border-b border-border pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">미배정</CardTitle>
                <Badge variant="outline">{unassigned.projectCount}건</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>매출 {formatWon(unassigned.revenue)}</span>
                <span>매입 {formatWon(unassigned.cost)}</span>
                <span>카드값 {formatWon(unassigned.card)}</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 py-3">
              {/* 회사 카드의 "연간 합계" 줄과 같은 모양. 카드마다 합계 줄이 다르게 생기면 눈이 헤맨다. */}
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-muted-foreground">이익</span>
                <span className={`text-sm font-bold tabular-nums ${metricClass(unassigned.profit)}`} style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{formatWon(unassigned.profit)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

          <Card className="rounded-[12px] border border-border py-0 shadow-none">
            <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{filterLabel} 등록 내역</CardTitle>
              <CardDescription className="mt-1">선택한 조건의 회사 장부와 프로젝트 매출·매입을 함께 표시합니다.</CardDescription>
            </div>
            <Badge variant="outline">{displayItems.length}건</Badge>
          </div>
        </CardHeader>
            <CardContent className="px-4 py-3">
          {displayItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">선택한 회사·기간에 등록된 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-border">
              {displayItems.map((item) => {
                const isRevenue = item.type === "revenue";
                const isCard = item.type === "card";
                return (
                  <div key={`${item.source}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={isRevenue ? toneBadgeClass("green") : isCard ? toneBadgeClass("amber") : toneBadgeClass("red")}>
                          {isRevenue ? "매출" : isCard ? "카드값" : "매입"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{item.company ?? "미배정"}</span>
                        {item.source === "project" ? (
                          <Link
                            href={`/projects/${item.projectId}`}
                            className="truncate text-sm font-medium text-foreground hover:underline"
                          >
                            프로젝트 · {item.projectName}
                          </Link>
                        ) : (
                          <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.dateKey}{item.memo ? ` · ${item.memo}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold tabular-nums ${isRevenue ? "text-primary" : "text-destructive"}`}>{formatWon(item.amount)}</span>
                      {canEdit && item.source === "entry" && <CompanyFinanceEntryDeleteButton id={item.id} title={item.title} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">프로젝트에서 온 금액은 프로젝트 화면에서 고칠 수 있습니다.</p>
    </div>
  );
}
