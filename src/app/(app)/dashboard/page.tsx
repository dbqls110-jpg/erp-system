import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, FolderKanban, Banknote, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [attendance, activeProjects, budget, expenses, upcomingEvents] = await Promise.all([
    prisma.attendance.findUnique({ where: { userId_date: { userId: session!.user.id, date: today } } }),
    prisma.project.count({ where: { status: "active" } }),
    prisma.budget.findUnique({ where: { year_month: { year, month } } }),
    prisma.expense.aggregate({
      where: { date: { gte: `${year}-${String(month).padStart(2, "0")}-01` } },
      _sum: { amount: true },
    }),
    prisma.project.findMany({
      where: { status: "active", deadline: { gte: today, lte: format(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd") } },
      orderBy: { deadline: "asc" },
      take: 5,
    }),
  ]);

  const totalExpenses = expenses._sum.amount ?? 0;
  const remaining = budget ? budget.amount - totalExpenses : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          대시보드
        </h1>
        <p className="text-sm text-smoke-gray mt-1">{format(now, "yyyy년 M월 d일 (eee)", { locale: ko })}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-smoke-gray">오늘 출근</CardTitle>
            <Clock size={16} className="text-deep-violet" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-deep-space-charcoal">
              {attendance?.clockIn ? format(new Date(attendance.clockIn), "HH:mm") : "미출근"}
            </p>
            <p className="text-xs text-smoke-gray mt-1">
              {attendance?.clockOut ? `퇴근 ${format(new Date(attendance.clockOut), "HH:mm")}` : attendance?.clockIn ? "근무 중" : "-"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-smoke-gray">진행 중 프로젝트</CardTitle>
            <FolderKanban size={16} className="text-electric-blue" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-deep-space-charcoal">{activeProjects}건</p>
            <p className="text-xs text-smoke-gray mt-1">현재 진행 중</p>
          </CardContent>
        </Card>

        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-smoke-gray">이번 달 잔여 예산</CardTitle>
            <Banknote size={16} className="text-vivid-purple" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-deep-space-charcoal">
              {remaining !== null ? `${remaining.toLocaleString()}원` : "미설정"}
            </p>
            <p className="text-xs text-smoke-gray mt-1">{budget ? `예산 ${budget.amount.toLocaleString()}원` : "-"}</p>
          </CardContent>
        </Card>

        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-smoke-gray">이번 주 마감</CardTitle>
            <Calendar size={16} className="text-warm-fade" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-deep-space-charcoal">{upcomingEvents.length}건</p>
            <p className="text-xs text-smoke-gray mt-1">7일 내 마감</p>
          </CardContent>
        </Card>
      </div>

      {upcomingEvents.length > 0 && (
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              이번 주 마감 일정
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcomingEvents.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-midnight-charcoal">{p.name}</span>
                  <span className="text-smoke-gray text-xs">{p.deadline} 마감</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
