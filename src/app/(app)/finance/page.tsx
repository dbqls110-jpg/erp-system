import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FinanceCharts } from "./FinanceCharts";
import { ExpenseAddButton } from "./ExpenseAddButton";
import { BudgetSetButton } from "./BudgetSetButton";
import { ExpenseDeleteButton } from "./ExpenseDeleteButton";
import { FinanceMonthNav } from "./FinanceMonthNav";

const categoryLabel: Record<string, string> = {
  rent: "임차료", salary: "인건비", telecom: "통신비",
  supplies: "비품", food: "식대", other: "기타",
};
const categoryColors: Record<string, string> = {
  rent: "#7b68ee", salary: "#0091ff", telecom: "#6647f0",
  supplies: "#514b81", food: "#ff5b36", other: "#b3b3b3",
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user?.role === "admin";
  const now = new Date();
  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  const [budget, expenses] = await Promise.all([
    prisma.budget.findUnique({ where: { year_month: { year, month } } }),
    prisma.expense.findMany({
      where: { date: { gte: `${year}-${monthStr}-01`, lte: monthEnd } },
      orderBy: { date: "desc" },
    }),
  ]);

  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = budget ? budget.amount - totalExpense : null;
  const usagePercent = budget ? Math.min(Math.round((totalExpense / budget.amount) * 100), 100) : 0;

  // 카테고리별 집계
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const categoryData = Object.entries(byCategory).map(([name, value]) => ({
    name: categoryLabel[name] ?? name, value, color: categoryColors[name] ?? "#b3b3b3",
  }));

  // 일별 집계
  const byDate = expenses.reduce((acc, e) => {
    acc[e.date] = (acc[e.date] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const dailyData = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date: date.slice(5), amount }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          재무 관리
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <FinanceMonthNav year={year} month={month} />
          {isAdmin && <BudgetSetButton year={year} month={month} currentAmount={budget?.amount} />}
          <ExpenseAddButton />
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">이번 달 예산</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-deep-space-charcoal">{budget ? `${budget.amount.toLocaleString()}원` : "미설정"}</p></CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">이번 달 지출</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalExpense > 0 ? "text-warm-fade" : "text-deep-space-charcoal"}`}>{totalExpense.toLocaleString()}원</p>
            {budget && <p className="text-xs text-smoke-gray mt-1">예산의 {usagePercent}% 사용</p>}
          </CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">잔여 예산</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${remaining !== null && remaining < 0 ? "text-destructive" : "text-deep-violet"}`}>
              {remaining !== null ? `${remaining.toLocaleString()}원` : "미설정"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 차트 */}
      {(categoryData.length > 0 || dailyData.length > 0) && (
        <FinanceCharts categoryData={categoryData} dailyData={dailyData} budget={budget?.amount} totalExpense={totalExpense} />
      )}

      {/* 지출 내역 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            지출 내역
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-smoke-gray">이번 달 지출 내역이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-smoke-gray w-16">{e.date.slice(5)}</span>
                    <span className="font-medium text-midnight-charcoal">{e.title}</span>
                    <Badge variant="outline" className="text-xs">{categoryLabel[e.category]}</Badge>
                    {e.memo && <span className="text-smoke-gray text-xs truncate max-w-xs">{e.memo}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{e.amount.toLocaleString()}원</span>
                    {isAdmin && <ExpenseDeleteButton id={e.id} title={e.title} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
