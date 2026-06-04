import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, FolderKanban, Banknote, Calendar, CalendarCheck, Palmtree } from "lucide-react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;

  const weekLater = format(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  // 근태 쿼리 2개 → 1개로 통합 (today 포함 이번달 전체)
  const [monthlyAttendance, activeProjects, budget, expenses, upcomingEvents, leaveBalance, fixedExpenses] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: session!.user.id, date: { gte: monthStart, lte: today } },
      select: { date: true, clockIn: true, clockOut: true },
      orderBy: { date: "desc" },
    }),
    prisma.project.count({ where: { status: "active" } }),
    prisma.budget.findUnique({ where: { year_month: { year, month } }, select: { amount: true } }),
    prisma.expense.aggregate({ where: { date: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.project.findMany({
      where: { status: "active", deadline: { gte: today, lte: weekLater } },
      select: { id: true, name: true, deadline: true },
      orderBy: { deadline: "asc" },
      take: 5,
    }),
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session!.user.id, year } },
      select: { totalDays: true, usedDays: true, pendingDays: true },
    }),
    prisma.fixedExpense.aggregate({ _sum: { amount: true } }),
  ]);

  const attendance = monthlyAttendance.find((r) => r.date === today) ?? null;
  const workDaysCount = monthlyAttendance.filter((r) => r.clockIn).length;

  const totalExpenses = expenses._sum.amount ?? 0;
  const totalFixed = fixedExpenses._sum.amount ?? 0;
  const otherExpenses = totalExpenses - totalFixed < 0 ? 0 : totalExpenses - totalFixed;
  const remaining = budget ? budget.amount - totalFixed - otherExpenses : null;
  const remainingLeave = leaveBalance
    ? leaveBalance.totalDays - leaveBalance.usedDays - leaveBalance.pendingDays
    : null;

  const widgets = [
    {
      href: "/attendance",
      title: "오늘 출근",
      icon: <Clock size={16} className="text-deep-violet" />,
      value: attendance?.clockIn ? format(new Date(attendance.clockIn), "HH:mm") : "미출근",
      sub: attendance?.clockOut
        ? `퇴근 ${format(new Date(attendance.clockOut), "HH:mm")}`
        : attendance?.clockIn ? "근무 중" : "-",
    },
    {
      href: "/projects",
      title: "진행 중 프로젝트",
      icon: <FolderKanban size={16} className="text-electric-blue" />,
      value: `${activeProjects}건`,
      sub: "현재 진행 중",
    },
    {
      href: "/finance",
      title: "이번 달 잔여 예산",
      icon: <Banknote size={16} className="text-vivid-purple" />,
      value: remaining !== null ? `${remaining.toLocaleString()}원` : "미설정",
      sub: budget ? `예산 ${budget.amount.toLocaleString()}원` : "-",
    },
    {
      href: "/calendar",
      title: "이번 주 마감",
      icon: <Calendar size={16} className="text-warm-fade" />,
      value: `${upcomingEvents.length}건`,
      sub: "7일 내 마감",
    },
    {
      href: "/attendance",
      title: "이번달 근무일수",
      icon: <CalendarCheck size={16} className="text-electric-blue" />,
      value: `${workDaysCount}일`,
      sub: `${month}월 출근 기록 기준`,
    },
    {
      href: "/leave",
      title: "잔여 휴가",
      icon: <Palmtree size={16} className="text-deep-violet" />,
      value: remainingLeave !== null ? `${remainingLeave}일` : "미설정",
      sub: leaveBalance ? `총 ${leaveBalance.totalDays}일 중 ${leaveBalance.usedDays}일 사용` : "휴가 잔여일 미설정",
    },
  ];

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60000} />
      <div>
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          대시보드
        </h1>
        <p className="text-sm text-smoke-gray mt-1">{format(now, "yyyy년 M월 d일 (eee)", { locale: ko })}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {widgets.map((w) => (
          <Link key={w.href + w.title} href={w.href}>
            <Card className="border-ash-gray shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-subtle)] hover:border-deep-violet/20 transition-all cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-smoke-gray">{w.title}</CardTitle>
                {w.icon}
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-deep-space-charcoal">{w.value}</p>
                <p className="text-xs text-smoke-gray mt-1">{w.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
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
                  <Link href={`/projects/${p.id}`} className="font-medium text-midnight-charcoal hover:text-deep-violet transition-colors">
                    {p.name}
                  </Link>
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
