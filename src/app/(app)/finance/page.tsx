import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FinanceCharts } from "./FinanceChartsWrapper";
import { ExpenseAddButton } from "./ExpenseAddButton";
import { BudgetSetButton } from "./BudgetSetButton";
import { ExpenseDeleteButton } from "./ExpenseDeleteButton";
import { FinanceMonthNav } from "./FinanceMonthNav";
import { FixedExpensePanel } from "./FixedExpensePanel";

const categoryLabel: Record<string, string> = {
  rent: "임차료", salary: "인건비", telecom: "통신비",
  supplies: "비품", food: "식대", software: "소프트웨어",
  insurance: "4대보험", other: "기타",
};
const categoryColors: Record<string, string> = {
  rent: "#7b68ee", salary: "#0091ff", telecom: "#6647f0",
  supplies: "#514b81", food: "#ff5b36", software: "#22c55e",
  insurance: "#f59e0b", other: "#b3b3b3",
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

  const [budget, expenses, fixedExpenses] = await Promise.all([
    prisma.budget.findUnique({ where: { year_month: { year, month } } }),
    prisma.expense.findMany({
      where: { date: { gte: `${year}-${monthStr}-01`, lte: monthEnd } },
      orderBy: { date: "desc" },
    }),
    prisma.fixedExpense.findMany({ orderBy: { order: "asc" } }),
  ]);

  // 이번 달 납부 완료된 고정비 ID 목록
  const checkedFixedIds = new Set(
    expenses
      .filter((e) => e.fixedExpenseId !== null)
      .map((e) => e.fixedExpenseId as string)
  );

  // 고정비 전체 합계 (납부 여부 무관)
  const totalFixed = fixedExpenses.reduce((sum, f) => sum + f.amount, 0);
  const paidFixedCount = fixedExpenses.filter(f => checkedFixedIds.has(f.id)).length;

  // 기타 지출 (고정비 외)
  const otherExpenses = expenses.filter(e => !e.fixedExpenseId);
  const totalOther = otherExpenses.reduce((sum, e) => sum + e.amount, 0);

  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);

  // 잔여 예산 = 예산 - 고정비 전체 - 기타 지출
  const remaining = budget ? budget.amount - totalFixed - totalOther : null;
  const usagePercent = budget ? Math.min(Math.round(((totalFixed + totalOther) / budget.amount) * 100), 100) : 0;

  // 카테고리별 집계 (실지출 + 미납부 고정비 포함)
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  // 미납부 고정비도 카테고리에 포함
  fixedExpenses.filter(f => !checkedFixedIds.has(f.id)).forEach(f => {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + f.amount;
  });

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">이번 달 예산</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-deep-space-charcoal">{budget ? `${budget.amount.toLocaleString()}원` : "미설정"}</p></CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">고정비</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-midnight-charcoal">{totalFixed.toLocaleString()}원</p>
            <p className="text-xs text-smoke-gray mt-1">{paidFixedCount}/{fixedExpenses.length}건 납부</p>
          </CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">기타 지출</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${totalOther > 0 ? "text-warm-fade" : "text-deep-space-charcoal"}`}>{totalOther.toLocaleString()}원</p>
            {budget && <p className="text-xs text-smoke-gray mt-1">예산의 {usagePercent}% 소진</p>}
          </CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-smoke-gray">잔여 예산</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${remaining !== null && remaining < 0 ? "text-destructive" : "text-deep-violet"}`}>
              {remaining !== null ? `${remaining.toLocaleString()}원` : "미설정"}
            </p>
            {remaining !== null && <p className="text-xs text-smoke-gray mt-1">고정비 포함 차감</p>}
          </CardContent>
        </Card>
      </div>

      {/* 고정비 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            고정비 ({fixedExpenses.filter(f => checkedFixedIds.has(f.id)).length}/{fixedExpenses.length} 납부)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FixedExpensePanel
            items={fixedExpenses}
            checkedIds={checkedFixedIds}
            year={year}
            month={month}
            isAdmin={isAdmin}
          />
        </CardContent>
      </Card>

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
