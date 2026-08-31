import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleMenus } from "@/lib/permissions";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, FolderKanban, Banknote, Calendar, CalendarCheck, Palmtree } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { summarizeAttendance } from "@/lib/attendanceSummary";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;

  const weekLater = format(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  // 대시보드는 전원이 들어오는 화면이라 여기서 집계를 그대로 보여주면 메뉴 권한이
  // 무의미해진다. 실제로 사원·파트너에게 회사 예산이 그대로 보이고 있었다.
  // 위젯마다 해당 메뉴 접근 권한이 있을 때만 값을 계산하고 내보낸다.
  const allowed = await getAccessibleMenus(session!.user.id, session!.user.role);
  const canSee = (menuKey: string) => allowed.has(menuKey);

  // 근태 쿼리 2개 → 1개로 통합 (today 포함 이번달 전체)
  const [monthlyAttendance, activeProjects, budget, expenses, upcomingEvents, leaveBalance, fixedExpenses] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: session!.user.id, date: { gte: monthStart, lte: today } },
      select: { date: true, clockIn: true, clockOut: true },
      orderBy: { date: "desc" },
    }),
    canSee("projects") ? prisma.project.count({ where: { status: "active" } }) : 0,
    canSee("finance")
      ? prisma.budget.findUnique({ where: { year_month: { year, month } }, select: { amount: true } })
      : null,
    canSee("finance")
      ? prisma.expense.aggregate({
          where: { date: { gte: monthStart }, fixedExpenseId: null },
          _sum: { amount: true },
        })
      : { _sum: { amount: 0 } },
    canSee("projects")
      ? prisma.project.findMany({
          where: { status: "active", deadline: { gte: today, lte: weekLater } },
          select: { id: true, name: true, deadline: true },
          orderBy: { deadline: "asc" },
          take: 5,
        })
      : [],
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session!.user.id, year } },
      select: { totalDays: true, usedDays: true, pendingDays: true },
    }),
    canSee("finance") ? prisma.fixedExpense.aggregate({ _sum: { amount: true } }) : { _sum: { amount: 0 } },
  ]);

  const attendance = monthlyAttendance.find((r) => r.date === today) ?? null;
  const attendanceSummary = summarizeAttendance(monthlyAttendance);

  const totalOther = expenses._sum.amount ?? 0;
  const totalFixed = fixedExpenses._sum.amount ?? 0;
  const remaining = budget ? budget.amount - totalFixed - totalOther : null;
  const remainingLeave = leaveBalance
    ? leaveBalance.totalDays - leaveBalance.usedDays - leaveBalance.pendingDays
    : null;

  const widgets = [
    {
      href: "/attendance",
      menuKey: "attendance",
      title: "오늘 출근",
      icon: <Clock size={16} className="text-primary" />,
      value: attendance?.clockIn ? format(new Date(attendance.clockIn), "HH:mm") : "미출근",
      sub: attendance?.clockOut
        ? `퇴근 ${format(new Date(attendance.clockOut), "HH:mm")}`
        : attendance?.clockIn ? "근무 중" : "-",
    },
    {
      href: "/projects",
      menuKey: "projects",
      title: "진행 중 프로젝트",
      icon: <FolderKanban size={16} className="text-primary" />,
      value: `${activeProjects}건`,
      sub: "현재 진행 중",
    },
    {
      href: "/finance",
      menuKey: "finance",
      title: "이번 달 잔여 예산",
      icon: <Banknote size={16} className="text-primary" />,
      value: remaining !== null ? `${remaining.toLocaleString()}원` : "미설정",
      sub: budget ? `예산 ${budget.amount.toLocaleString()}원` : "-",
    },
    {
      href: "/calendar",
      menuKey: "projects",
      title: "이번 주 마감",
      icon: <Calendar size={16} className="text-destructive" />,
      value: `${upcomingEvents.length}건`,
      sub: "7일 내 마감",
    },
    {
      href: "/attendance",
      menuKey: "attendance",
      title: "이번달 근무일수",
      icon: <CalendarCheck size={16} className="text-primary" />,
      value: `${attendanceSummary.workDays}일`,
      sub: attendanceSummary.uncalculatedHours > 0
        ? `${month}월 출근 기록 · 미퇴근 ${attendanceSummary.missingClockOut}건`
        : `${month}월 출근 기록 기준`,
    },
    {
      href: "/leave",
      menuKey: "leave",
      title: "잔여 휴가",
      icon: <Palmtree size={16} className="text-primary" />,
      value: remainingLeave !== null ? `${remainingLeave}일` : "미설정",
      sub: leaveBalance ? `총 ${leaveBalance.totalDays}일 중 ${leaveBalance.usedDays}일 사용` : "휴가 잔여일 미설정",
    },
  ];

  const visibleWidgets = widgets.filter((w) => canSee(w.menuKey));

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-muted-foreground">{format(now, "yyyy년 M월 d일 (eee)", { locale: ko })}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        {visibleWidgets.map((w) => (
          <Link key={w.href + w.title} href={w.href}>
            <Card className="@container/card h-full shadow-xs transition-all hover:border-primary/20 hover:shadow-sm cursor-pointer">
              <CardHeader>
                <CardDescription>{w.title}</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{w.value}</CardTitle>
                <CardAction>{w.icon}</CardAction>
              </CardHeader>
              <CardContent>
                <p className="mt-1 text-xs text-muted-foreground">{w.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {upcomingEvents.length > 0 && (
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              이번 주 마감 일정
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcomingEvents.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <Link href={`/projects/${p.id}`} className="font-medium text-foreground transition-colors hover:text-primary">
                    {p.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{p.deadline} 마감</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
