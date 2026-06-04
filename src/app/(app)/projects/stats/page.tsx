import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-smoke-gray hover:text-midnight-charcoal transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          매출/매입 통계 ({year}년)
        </h1>
      </div>

      {/* 연간 요약 */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">연 매출</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-green-600">{totalRevenue.toLocaleString()}원</p></CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">연 매입</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-warm-fade">{totalCost.toLocaleString()}원</p></CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">연 순이익</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${totalProfit >= 0 ? "text-deep-violet" : "text-destructive"}`}>
              {totalProfit.toLocaleString()}원
            </p>
          </CardContent>
        </Card>
      </div>

      <RevenueCharts monthlyData={monthlyData} quarterlyData={quarterlyData} yearlyData={yearlyData} />
    </div>
  );
}
