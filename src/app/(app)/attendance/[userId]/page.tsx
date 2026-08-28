import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toneBadgeClass } from "@/lib/badge-tone";
import { CalendarX2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { summarizeAttendance } from "@/lib/attendanceSummary";

export default async function EmployeeAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/attendance");

  const { userId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));
  const monthStr = String(month).padStart(2, "0");
  const start = `${year}-${monthStr}-01`;
  const end = `${year}-${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const [user, records] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
    prisma.attendance.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    }),
  ]);

  if (!user) notFound();

  const attendanceSummary = summarizeAttendance(records);

  function fmt(d: Date | null) {
    if (!d) return "—";
    return new Date(d).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function dayLabel(dateStr: string) {
    const d = new Date(dateStr);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${dateStr.slice(5)} (${days[d.getDay()]})`;
  }

  const prevMonth = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextMonth = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/attendance" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <p className="mt-1 text-sm text-muted-foreground">{user.name ?? user.email}의 {year}년 {month}월 근태 기록입니다.</p>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>출근일수</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{attendanceSummary.workDays}일</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceSummary.missingClockOut > 0 && (
              <p className="text-xs text-muted-foreground">미퇴근 {attendanceSummary.missingClockOut}건</p>
            )}
          </CardContent>
        </Card>
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>총 근무시간</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-primary @[250px]/card:text-3xl">{attendanceSummary.totalHours.toFixed(1)}h</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceSummary.uncalculatedHours > 0 && (
              <p className="text-xs text-muted-foreground">시간 계산 불가 {attendanceSummary.uncalculatedHours}건</p>
            )}
          </CardContent>
        </Card>
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>일 평균</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-primary @[250px]/card:text-3xl">{attendanceSummary.completedDays > 0 ? (attendanceSummary.totalHours / attendanceSummary.completedDays).toFixed(1) : "0"}h</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">계산된 출근일 기준</p>
          </CardContent>
        </Card>
      </div>

      {/* 일별 기록 */}
      <Card className="shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-foreground">
              일별 근태 기록
            </CardTitle>
            <div className="flex items-center gap-1 text-sm">
              <Link href={`/attendance/${userId}${prevMonth}`} className="p-1 text-muted-foreground hover:text-primary transition-colors">‹</Link>
              <span className="text-foreground font-medium px-2">{year}년 {month}월</span>
              <Link href={`/attendance/${userId}${nextMonth}`} className="p-1 text-muted-foreground hover:text-primary transition-colors">›</Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CalendarX2 className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">이번 달 근태 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 text-sm">
                  <span className="font-medium text-foreground w-28 shrink-0">{dayLabel(r.date)}</span>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>출근 <span className="text-foreground font-medium">{fmt(r.clockIn)}</span></span>
                    <span>퇴근 <span className="text-foreground font-medium">{fmt(r.clockOut)}</span></span>
                    {r.workHours != null && (
                      <Badge variant="outline" className={toneBadgeClass("gray")}>{r.workHours.toFixed(1)}h</Badge>
                    )}
                    {r.clockIn && r.workHours == null && (
                      <Badge variant="outline" className={`${toneBadgeClass("amber")} text-[10px] py-0`}>
                        {r.clockOut ? "시간 계산 불가" : "퇴근 미기록 · 시간 미계산"}
                      </Badge>
                    )}
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
