import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toneBadgeClass } from "@/lib/badge-tone";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import { Clock } from "lucide-react";
import { ClockButtons } from "./ClockButtons";
import { AdminMonthlyPanel } from "./AdminMonthlyPanel";
import { WorkingTimer } from "./WorkingTimer";
import { AttendanceAdminRow } from "./AttendanceAdminRow";
import { summarizeAttendance } from "@/lib/attendanceSummary";

function isLate(d: Date | null) {
  if (!d) return false;
  const dt = new Date(d);
  return dt.getHours() > 10 || (dt.getHours() === 10 && dt.getMinutes() > 0);
}
function isOvertime(d: Date | null) {
  if (!d) return false;
  const dt = new Date(d);
  return dt.getHours() > 18 || (dt.getHours() === 18 && dt.getMinutes() > 0);
}

export default async function AttendancePage() {
  const session = await getServerSession(authOptions);
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const isAdmin = session?.user?.role === "admin";

  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  const [todayRecord, monthlyRecords, allRecords] = await Promise.all([
    prisma.attendance.findUnique({
      where: { userId_date: { userId: session!.user.id, date: today } },
    }),
    prisma.attendance.findMany({
      where: { userId: session!.user.id, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: "desc" },
    }),
    isAdmin
      ? prisma.attendance.findMany({
          // AI 대화 파이프라인 제거로 에이전트 계정의 근태는 의미가 없어졌다
          where: { date: today, user: { isAgent: false } },
          include: { user: { select: { name: true, email: true, isAgent: true } } },
          orderBy: { clockIn: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const attendanceSummary = summarizeAttendance(monthlyRecords);
  const late = isLate(todayRecord?.clockIn ?? null);
  const working = !!todayRecord?.clockIn && !todayRecord?.clockOut;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">오늘과 이번 달 근태 현황을 확인할 수 있습니다.</p>
        </div>
        <ClockButtons
          hasClockIn={!!todayRecord?.clockIn}
          hasClockOut={!!todayRecord?.clockOut}
        />
      </div>

      {/* 오늘 현황 */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>오늘 출근</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {todayRecord?.clockIn ? format(new Date(todayRecord.clockIn), "HH:mm") : "—"}
            </CardTitle>
            <CardAction className="flex items-center gap-2">
              <Clock className="size-3.5 text-primary" />
              {late && (
                <Badge variant="outline" className={`${toneBadgeClass("amber")} text-xs`}>지각</Badge>
              )}
            </CardAction>
          </CardHeader>
          <CardContent>
            {working && todayRecord?.clockIn && (
              <div className="mt-1">
                <WorkingTimer clockInIso={new Date(todayRecord.clockIn).toISOString()} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>오늘 퇴근</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {todayRecord?.clockOut
                ? format(new Date(todayRecord.clockOut), "HH:mm")
                : todayRecord?.clockIn ? "근무 중" : "—"}
            </CardTitle>
            <CardAction className="flex items-center gap-2">
              <Clock className="size-3.5 text-primary" />
              {isOvertime(todayRecord?.clockOut ?? null) && (
                <Badge variant="outline" className={`${toneBadgeClass("purple")} text-xs`}>야근</Badge>
              )}
            </CardAction>
          </CardHeader>
        </Card>

        <Card className="@container/card h-full shadow-xs">
          <CardHeader>
            <CardDescription>이번 달 총 근무</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {attendanceSummary.totalHours.toFixed(1)}시간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              출근 {attendanceSummary.workDays}일
              {attendanceSummary.uncalculatedHours > 0 && ` · 시간 계산 불가 ${attendanceSummary.uncalculatedHours}건`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 관리자: 오늘 전체 현황 */}
      {isAdmin && (
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              오늘 직원 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allRecords.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Clock className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">오늘 출근한 직원이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(allRecords as Array<{ id: string; date: string; user: { name: string | null; email: string; isAgent: boolean }; clockIn: Date | null; clockOut: Date | null; workHours: number | null }>).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{r.user.name ?? r.user.email}</span>
                      {r.user.isAgent && (
                        <Badge variant="outline" className={`${toneBadgeClass("purple")} text-[10px] py-0 px-1.5`}>AI</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>출근 {r.clockIn ? format(new Date(r.clockIn), "HH:mm") : "—"}</span>
                        {isLate(r.clockIn) && (
                          <Badge variant="outline" className={`${toneBadgeClass("amber")} text-[10px] py-0`}>지각</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>퇴근 {r.clockOut ? format(new Date(r.clockOut), "HH:mm") : "근무 중"}</span>
                        {isOvertime(r.clockOut) && (
                          <Badge variant="outline" className={`${toneBadgeClass("purple")} text-[10px] py-0`}>야근</Badge>
                        )}
                      </div>
                      {r.workHours && <Badge variant="outline">{r.workHours.toFixed(1)}h</Badge>}
                      <AttendanceAdminRow
                        id={r.id}
                        date={r.date}
                        clockInIso={r.clockIn ? new Date(r.clockIn).toISOString() : null}
                        clockOutIso={r.clockOut ? new Date(r.clockOut).toISOString() : null}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 관리자: 월별 전체 직원 조회 */}
      {isAdmin && <AdminMonthlyPanel initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} />}

      {/* 이번 달 기록 */}
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            {format(now, "M월", { locale: ko })} 근태 기록
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Clock className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">이번 달 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {monthlyRecords.map((r) => {
                const ci = r.clockIn ? new Date(r.clockIn) : null;
                const co = r.clockOut ? new Date(r.clockOut) : null;
                const missingClockOut = !!ci && !co;
                const late = isLate(ci);
                const ot = isOvertime(co);
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                    <div className="flex items-center gap-2">
                      {missingClockOut && (
                        <span className="size-1.5 rounded-full bg-muted-foreground shrink-0" title="퇴근 미기록" />
                      )}
                      <span className="font-medium text-foreground">
                        {format(new Date(r.date), "M/d (eee)", { locale: ko })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground flex-wrap justify-end">
                      <div className="flex items-center gap-1.5">
                        <span>출근 {ci ? format(ci, "HH:mm") : "—"}</span>
                        {late && (
                          <Badge variant="outline" className={`${toneBadgeClass("amber")} text-[10px] py-0`}>지각</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={missingClockOut ? "text-muted-foreground font-medium" : ""}>
                          퇴근 {co ? format(co, "HH:mm") : "미기록"}
                        </span>
                        {ot && (
                          <Badge variant="outline" className={`${toneBadgeClass("purple")} text-[10px] py-0`}>야근</Badge>
                        )}
                      </div>
                      <span className="w-14 text-right">
                        {r.workHours != null ? `${r.workHours.toFixed(1)}h` : (
                          <Badge variant="outline" className={`${toneBadgeClass("amber")} text-[10px] py-0`}>
                            {missingClockOut ? "시간 미계산" : "계산 불가"}
                          </Badge>
                        )}
                      </span>
                      {isAdmin && (
                        <AttendanceAdminRow
                          id={r.id}
                          date={r.date}
                          clockInIso={r.clockIn ? new Date(r.clockIn).toISOString() : null}
                          clockOutIso={r.clockOut ? new Date(r.clockOut).toISOString() : null}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
