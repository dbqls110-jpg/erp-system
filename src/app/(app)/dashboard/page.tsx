import { prisma } from "@/lib/prisma";
import { getAccessibleMenus } from "@/lib/permissions";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, FolderKanban, Banknote, Calendar, CalendarCheck, Palmtree, MessageCircle, MapPinned } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { summarizeAttendance } from "@/lib/attendanceSummary";
import { getUnreadCount } from "@/app/actions/message";
import { getCalendarViewer } from "@/lib/calendarViewer";
import { calendarWhereFor, projectWhereFor } from "@/lib/calendarVisibility";
import { getDashboardAudience } from "@/lib/dashboardVisibility";
import { calculateBudgetMetrics } from "@/lib/financeMetrics";
import { fixedExpenseMonthWhere, monthKey } from "@/lib/fixedExpenseMonths";
import { getVenueWeekRange } from "@/lib/venueKpi";

export default async function DashboardPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const monthStr = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthStr}-01`;
  const monthEnd = `${year}-${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const viewMonth = monthKey(year, month);

  const weekLater = format(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const viewer = (await getCalendarViewer())!;
  if (getDashboardAudience(viewer) === "external") {
    const [unreadCount, participatingProjects, upcomingSchedules] = await Promise.all([
      getUnreadCount(),
      prisma.project.findMany({
        where: {
          status: "active",
          AND: [projectWhereFor(viewer)],
        },
        select: { id: true, name: true, deadline: true },
        orderBy: [{ deadline: "asc" }, { name: "asc" }],
      }),
      prisma.calendarEvent.findMany({
        where: {
          AND: [
            { date: { gte: today, lte: weekLater } },
            calendarWhereFor(viewer),
          ],
        },
        select: { id: true, title: true, date: true, endDate: true },
        orderBy: [{ date: "asc" }, { title: "asc" }],
      }),
    ]);

    return (
      <ExternalDashboard
        unreadCount={unreadCount}
        participatingProjects={participatingProjects}
        upcomingSchedules={upcomingSchedules}
      />
    );
  }

  // 대시보드는 전원이 들어오는 화면이라 여기서 집계를 그대로 보여주면 메뉴 권한이
  // 무의미해진다. 실제로 사원·파트너에게 회사 예산이 그대로 보이고 있었다.
  // 위젯마다 해당 메뉴 접근 권한이 있을 때만 값을 계산하고 내보낸다.
  const allowed = await getAccessibleMenus(viewer.id, viewer.role ?? undefined);
  const canSee = (menuKey: string) => allowed.has(menuKey);

  // 근태 쿼리 2개 → 1개로 통합 (today 포함 이번달 전체)
  const venueWeek = getVenueWeekRange(now);
  const [monthlyAttendance, activeProjects, budget, expenses, upcomingEvents, leaveBalance, fixedExpenses, venueKpiOwner] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: viewer.id, date: { gte: monthStart, lte: today } },
      select: { date: true, clockIn: true, clockOut: true },
      orderBy: { date: "desc" },
    }),
    canSee("projects") ? prisma.project.count({ where: { status: "active" } }) : 0,
    canSee("finance")
      ? prisma.budget.findUnique({ where: { year_month: { year, month } }, select: { amount: true } })
      : null,
    canSee("finance")
      ? prisma.expense.aggregate({
          where: { date: { gte: monthStart, lte: monthEnd }, fixedExpenseId: null },
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
      where: { userId_year: { userId: viewer.id, year } },
      select: { totalDays: true, usedDays: true, pendingDays: true },
    }),
    canSee("finance")
      ? prisma.fixedExpense.findMany({
          where: fixedExpenseMonthWhere(viewMonth),
          select: { amount: true },
        })
      : [],
    canSee("venues")
      ? prisma.user.findFirst({
          where: {
            active: true,
            role: { not: "pending" },
            OR: [
              { name: { contains: "박석영" } },
              { email: "qkrtjrdud952@gmail.com" },
            ],
          },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : null,
  ]);

  const venueKpiRows = venueKpiOwner
    ? await prisma.venue.findMany({
        where: { createdById: venueKpiOwner.id, createdAt: { gte: venueWeek.start, lt: venueWeek.endExclusive } },
        select: { id: true, name: true, address: true, reserveUrl: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const attendance = monthlyAttendance.find((r) => r.date === today) ?? null;
  const attendanceSummary = summarizeAttendance(monthlyAttendance);

  const totalOther = expenses._sum.amount ?? 0;
  const totalFixed = fixedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const budgetMetrics = calculateBudgetMetrics(budget?.amount ?? null, totalFixed, totalOther);
  const remaining = budgetMetrics.remaining;
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
      // 예산을 넘긴 달은 한눈에 보여야 한다. 재무 화면이 같은 값을 빨갛게 보여주는데 여기만 검으면 어긋난다.
      valueClassName: remaining !== null && remaining < 0 ? "text-destructive" : undefined,
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
    {
      href: `/dashboard/venue-kpi?week=${venueWeek.startDate}`,
      menuKey: "venues",
      title: "주간 공간 등록",
      icon: <MapPinned size={16} className="text-primary" />,
      value: `${venueKpiRows.length}건`,
      valueClassName: venueKpiRows.length <= 4 ? "text-destructive" : undefined,
      sub: `${venueWeek.startDate.slice(5)} ~ ${venueWeek.endDate.slice(5)} · 공간명·주소·링크 보기`,
    },
  ];

  const visibleWidgets = widgets.filter((w) => canSee(w.menuKey));

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-[13px] text-muted-foreground">{format(now, "yyyy년 M월 d일 (eee)", { locale: ko })}</p>
      </div>

      <div className="grid grid-cols-1 gap-[14px] @md/main:grid-cols-2 @xl/main:grid-cols-4">
        {visibleWidgets.map((w) => (
          <Link key={w.href + w.title} href={w.href}>
            <Card className="@container/card h-full rounded-[12px] border border-border py-0 shadow-none transition-all hover:border-[#d8d4fb] hover:shadow-sm dark:bg-card">
              <CardHeader className="gap-[6px] px-[18px] py-4">
                <CardDescription className="text-[12px] text-muted-foreground">{w.title}</CardDescription>
                <CardTitle className={`text-[26px] font-bold leading-tight tracking-[-0.01em] tabular-nums${w.valueClassName ? ` ${w.valueClassName}` : ""}`} style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{w.value}</CardTitle>
                <CardAction>{w.icon}</CardAction>
              </CardHeader>
              <CardContent className="px-[18px] pb-4 pt-0">
                <p className="text-[12px] leading-4 text-muted-foreground">{w.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {upcomingEvents.length > 0 && (
        <Card className="rounded-[12px] border border-border py-0 shadow-none dark:bg-card">
          <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
            <CardTitle className="text-[14px] font-semibold text-foreground">
              이번 주 마감 일정
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-0">
            <ul className="divide-y divide-[#f0f0f0] dark:divide-border">
              {upcomingEvents.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-3 text-[12px] leading-4">
                  <Link href={`/projects/${p.id}`} className="font-medium text-foreground transition-colors hover:text-primary">
                    {p.name}
                  </Link>
                  <span className="shrink-0 text-[12px] text-muted-foreground">{p.deadline} 마감</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type ExternalProject = { id: string; name: string; deadline: string | null };
type ExternalSchedule = { id: string; title: string; date: string; endDate: string | null };

function ExternalDashboard({
  unreadCount,
  participatingProjects,
  upcomingSchedules,
}: {
  unreadCount: number;
  participatingProjects: ExternalProject[];
  upcomingSchedules: ExternalSchedule[];
}) {
  return (
    <div className="space-y-4">
      <Link href="/messenger" className="block">
        <Card className="rounded-[12px] border border-border py-0 shadow-none transition-all hover:border-[#d8d4fb] hover:shadow-sm dark:bg-card">
          <CardHeader className="gap-[6px] px-[18px] py-4">
            <CardDescription className="text-[12px] text-muted-foreground">안 읽은 메시지</CardDescription>
            <CardTitle className="text-[26px] font-bold leading-tight tracking-[-0.01em] tabular-nums" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>{unreadCount}건</CardTitle>
            <CardAction><MessageCircle size={16} className="text-primary" /></CardAction>
          </CardHeader>
          <CardContent className="px-[18px] pb-4 pt-0">
            <p className="text-[12px] leading-4 text-muted-foreground">메신저에서 확인하세요</p>
          </CardContent>
        </Card>
      </Link>

      <div className="grid grid-cols-1 gap-[14px] @xl/main:grid-cols-2">
        <Card className="rounded-[12px] border border-border py-0 shadow-none dark:bg-card">
          <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
            <CardTitle className="text-[14px] font-semibold text-foreground">참여 중인 프로젝트</CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-0">
            {participatingProjects.length > 0 ? (
              <ul className="divide-y divide-[#f0f0f0] dark:divide-border">
                {participatingProjects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-4 py-3 text-[12px] leading-4">
                    <Link href={`/projects/${project.id}`} className="min-w-0 truncate font-medium text-foreground transition-colors hover:text-primary">
                      {project.name}
                    </Link>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {project.deadline ? `${project.deadline} 마감` : "마감일 미정"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[12px] leading-4 text-muted-foreground">참여 중인 프로젝트가 없습니다.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[12px] border border-border py-0 shadow-none dark:bg-card">
          <CardHeader className="border-b border-[#f0f0f0] px-4 py-3.5 dark:border-border">
            <CardTitle className="text-[14px] font-semibold text-foreground">다가오는 일정</CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-0">
            {upcomingSchedules.length > 0 ? (
              <ul className="divide-y divide-[#f0f0f0] dark:divide-border">
                {upcomingSchedules.map((schedule) => (
                  <li key={schedule.id} className="flex items-center justify-between gap-4 py-3 text-[12px] leading-4">
                    <span className="min-w-0 truncate text-foreground">{schedule.title}</span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {schedule.endDate && schedule.endDate > schedule.date
                        ? `${schedule.date} ~ ${schedule.endDate}`
                        : schedule.date}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[12px] leading-4 text-muted-foreground">다가오는 일정이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
