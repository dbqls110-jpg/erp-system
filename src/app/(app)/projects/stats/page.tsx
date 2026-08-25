import { prisma } from "@/lib/prisma";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueCharts } from "./RevenueChartsWrapper";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const now = new Date();

function getQuarter(month: number) {
  return Math.ceil(month / 3);
}

export default async function ProjectStatsPage() {
  const year = now.getFullYear();

  const projects = await prisma.project.findMany({
    where: { revenue: { not: null } },
    select: { id: true, name: true, revenue: true, cost: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // 월별 집계
  const monthly: Record<number, { revenue: number; cost: number }> = {};
  for (let m = 1; m <= 12; m++) monthly[m] = { revenue: 0, cost: 0 };

  // 연도별 집계
  const yearly: Record<number, { revenue: number; cost: number }> = {};

  // 분기별 집계 (이번 연도)
  const quarterly: Record<number, { revenue: number; cost: number }> = { 1: { revenue: 0, cost: 0 }, 2: { revenue: 0, cost: 0 }, 3: { revenue: 0, cost: 0 }, 4: { revenue: 0, cost: 0 } };

  for (const p of projects) {
    const d = new Date(p.createdAt);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const q = getQuarter(m);
    const rev = p.revenue ?? 0;
    const cost = p.cost ?? 0;

    if (y === year) {
      monthly[m].revenue += rev;
      monthly[m].cost += cost;
      quarterly[q].revenue += rev;
      quarterly[q].cost += cost;
    }

    if (!yearly[y]) yearly[y] = { revenue: 0, cost: 0 };
    yearly[y].revenue += rev;
    yearly[y].cost += cost;
  }

  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1}월`,
    revenue: monthly[i + 1].revenue,
    cost: monthly[i + 1].cost,
    profit: monthly[i + 1].revenue - monthly[i + 1].cost,
  }));

  const quarterlyData = [1, 2, 3, 4].map(q => ({
    label: `${q}분기`,
    revenue: quarterly[q].revenue,
    cost: quarterly[q].cost,
    profit: quarterly[q].revenue - quarterly[q].cost,
  }));

  const yearlyData = Object.entries(yearly).sort(([a], [b]) => Number(a) - Number(b)).map(([y, v]) => ({
    label: `${y}년`,
    revenue: v.revenue,
    cost: v.cost,
    profit: v.revenue - v.cost,
  }));

  const totalRevenue = yearly[year]?.revenue ?? 0;
  const totalCost = yearly[year]?.cost ?? 0;
  const totalProfit = totalRevenue - totalCost;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <p className="mt-1 text-sm text-muted-foreground">매출과 매입, 순이익을 연도별로 확인할 수 있습니다.</p>
        </div>
      </div>

      {/* 연간 요약 */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>연 매출</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl text-primary">{totalRevenue.toLocaleString()}원</CardTitle>
          </CardHeader>
        </Card>
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>연 매입</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl text-destructive">{totalCost.toLocaleString()}원</CardTitle>
          </CardHeader>
        </Card>
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>연 순이익</CardDescription>
            <CardTitle className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
              {totalProfit.toLocaleString()}원
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <RevenueCharts monthlyData={monthlyData} quarterlyData={quarterlyData} yearlyData={yearlyData} />
    </div>
  );
}

