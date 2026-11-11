import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueCharts } from "./RevenueChartsWrapper";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCalendarViewer } from "@/lib/calendarViewer";
import { isExternal } from "@/lib/calendarVisibility";
import { currentKoreanDateKey } from "@/lib/dateFormat";
import { projectFinanceStats } from "@/lib/projectFinanceStats";
import { redirect } from "next/navigation";

export default async function ProjectStatsPage() {
  const session = await getServerSession(authOptions);
  const viewer = await getCalendarViewer();
  // 외부 계정은 연결된 프로젝트 상세만 볼 수 있고, 회사 전체 매출·매입 통계는 볼 수 없다.
  if (!session?.user?.id || !viewer || session.user.active === false) redirect("/login");
  if (isExternal(viewer)) redirect("/projects");
  await requireMenuAccess(session.user.id, "projects", session.user.role);
  const year = Number(currentKoreanDateKey().slice(0, 4));
  const amounts = await prisma.projectAmount.findMany({
    where: { kind: { in: ["revenue", "cost"] } },
    select: { kind: true, amount: true, createdAt: true, paidDate: true, invoiceDate: true, expectedPaymentDate: true },
  });
  const { monthlyData, quarterlyData, yearlyData, totalRevenue, totalCost, totalProfit, undatedRevenueCount, undatedRevenueAmount } = projectFinanceStats(amounts, year);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <p className="mt-1 text-sm text-muted-foreground">프로젝트 매출·매입을 연도별로 확인합니다. 별도 회사 장부·카드값은 포함하지 않습니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">매출: 실제 입금일 → 계산서 발행일 → 입금 예정일 · 매입: 금액 등록일(한국시간) · 차액은 매출 − 매입이며 당기순이익과 다릅니다.</p>
        </div>
      </div>

      {undatedRevenueCount > 0 && <p role="status" className="rounded-lg border p-3 text-sm text-amber-700">매출 날짜 미정 {undatedRevenueCount}건 · {undatedRevenueAmount.toLocaleString()}원. 날짜를 임의로 넣지 않고 모든 기간 합계에서 제외했습니다.</p>}
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
            <CardDescription>연 매출·매입 차액</CardDescription>
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
