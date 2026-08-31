import { after } from "next/server";
import { getServerSession } from "next-auth";
import { requireMenuAccess } from "@/lib/permissions";
import { syncMissingMonthSheets } from "@/lib/financeSheet";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toneBadgeClass } from "@/lib/badge-tone";
import { ReceiptText } from "lucide-react";
import { FinanceCharts } from "./FinanceChartsWrapper";
import { ExpenseAddButton } from "./ExpenseAddButton";
import { BudgetSetButton } from "./BudgetSetButton";
import { ExpenseDeleteButton } from "./ExpenseDeleteButton";
import { FinanceMonthNav } from "./FinanceMonthNav";
import { FixedExpensePanel } from "./FixedExpensePanel";
import { calculateBudgetMetrics } from "@/lib/financeMetrics";

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
  await requireMenuAccess(session!.user.id, "finance", session!.user.role);

  // 끝난 달의 재무를 시트로 옮긴다. 예전에는 관리자가 API 를 직접 호출해야만 그 달
  // 탭이 생겨서 7월과 8월이 통째로 비어 있었다. 사람이 기억해서 눌러야 하는
  // 자동화는 자동화가 아니다.
  //
  // 달 단위로 판단한다. 달이 바뀌고 처음 이 화면을 열 때 지난 달이 마감되고,
  // 그 뒤로는 같은 달 안에서 몇 번을 열어도 구글을 두드리지 않는다.
  //
  // after() 로 응답을 보낸 뒤에 돌린다. 여기서 기다리면 구글 왕복만큼 화면이 늦게 뜬다.
  after(async () => {
    try {
      await syncMissingMonthSheets();
    } catch (err) {
      console.error("[재무 시트 자동 생성 실패]", err);
    }
  });
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

  // 카드·차트 공통 기준: 납부 여부와 관계없이 해당 월 고정비 전체 + 기타 지출.
  const budgetMetrics = calculateBudgetMetrics(budget?.amount ?? null, totalFixed, totalOther);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><p className="mt-1 text-sm text-muted-foreground">월별 예산과 지출 내역을 관리합니다.</p></div>
        <div className="flex items-center gap-3 flex-wrap">
          <FinanceMonthNav
            year={year}
            month={month}
            currentYear={now.getFullYear()}
            currentMonth={now.getMonth() + 1}
          />
          {isAdmin && <BudgetSetButton year={year} month={month} currentAmount={budget?.amount} />}
          <ExpenseAddButton initialDate={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`} />
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>이번 달 예산</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{budget ? `${budget.amount.toLocaleString()}원` : "미설정"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>고정비</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{totalFixed.toLocaleString()}원</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mt-1">{paidFixedCount}/{fixedExpenses.length}건 납부</p>
          </CardContent>
        </Card>
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>기타 지출</CardDescription>
            <CardTitle className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${totalOther > 0 ? "text-destructive" : "text-foreground"}`}>{totalOther.toLocaleString()}원</CardTitle>
          </CardHeader>
          <CardContent>
            {budget && <p className="text-xs text-muted-foreground mt-1">예산의 {budgetMetrics.usagePercent}% 소진 (고정비 포함)</p>}
          </CardContent>
        </Card>
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>잔여 예산</CardDescription>
            <CardTitle className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${budgetMetrics.remaining !== null && budgetMetrics.remaining < 0 ? "text-destructive" : "text-primary"}`}>
              {budgetMetrics.remaining !== null ? `${budgetMetrics.remaining.toLocaleString()}원` : "미설정"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {budgetMetrics.remaining !== null && <p className="text-xs text-muted-foreground mt-1">고정비 포함 차감</p>}
          </CardContent>
        </Card>
      </div>

      {/* 고정비 */}
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
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
        <FinanceCharts
          categoryData={categoryData}
          dailyData={dailyData}
          budget={budget?.amount}
          plannedExpense={budgetMetrics.plannedExpense}
          usagePercent={budgetMetrics.usagePercent}
        />
      )}

      {/* 지출 내역 */}
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            지출 내역
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ReceiptText className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">이번 달 지출 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground w-16">{e.date.slice(5)}</span>
                    <span className="font-medium text-foreground">{e.title}</span>
                    <Badge variant="outline" className={toneBadgeClass("blue")}>{categoryLabel[e.category]}</Badge>
                    {e.memo && <span className="text-muted-foreground text-xs truncate max-w-xs">{e.memo}</span>}
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
