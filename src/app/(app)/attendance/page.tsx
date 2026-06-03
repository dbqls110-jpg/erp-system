import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import { Clock } from "lucide-react";
import { ClockButtons } from "./ClockButtons";
import { AdminMonthlyPanel } from "./AdminMonthlyPanel";
import { WorkingTimer } from "./WorkingTimer";

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
          where: { date: today },
          include: { user: { select: { name: true, email: true } } },
          orderBy: { clockIn: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const totalWorkHours = monthlyRecords.reduce((sum, r) => sum + (r.workHours ?? 0), 0);
  const late = isLate(todayRecord?.clockIn ?? null);
  const working = !!todayRecord?.clockIn && !todayRecord?.clockOut;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          근태 관리
        </h1>
        <ClockButtons
          hasClockIn={!!todayRecord?.clockIn}
          hasClockOut={!!todayRecord?.clockOut}
        />
      </div>

      {/* 오늘 현황 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-smoke-gray">오늘 출근</CardTitle>
            <Clock size={16} className="text-deep-violet" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-deep-space-charcoal">
                {todayRecord?.clockIn ? format(new Date(todayRecord.clockIn), "HH:mm") : "—"}
              </p>
              {late && <Badge className="bg-orange-100 text-orange-600 border-orange-200 text-xs">지각</Badge>}
            </div>
            {working && todayRecord?.clockIn && (
              <div className="mt-1">
                <WorkingTimer clockInIso={new Date(todayRecord.clockIn).toISOString()} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-smoke-gray">오늘 퇴근</CardTitle>
            <Clock size={16} className="text-electric-blue" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-deep-space-charcoal">
                {todayRecord?.clockOut
                  ? format(new Date(todayRecord.clockOut), "HH:mm")
                  : todayRecord?.clockIn ? "근무 중" : "—"}
              </p>
              {isOvertime(todayRecord?.clockOut ?? null) && (
                <Badge className="bg-purple-100 text-purple-600 border-purple-200 text-xs">야근</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-smoke-gray">이번 달 총 근무</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-deep-space-charcoal">{totalWorkHours.toFixed(1)}시간</p>
          </CardContent>
        </Card>
      </div>

      {/* 관리자: 오늘 전체 현황 */}
      {isAdmin && (
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              오늘 직원 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allRecords.length === 0 ? (
              <p className="text-sm text-smoke-gray">오늘 출근한 직원이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {(allRecords as Array<{ id: string; user: { name: string | null; email: string }; clockIn: Date | null; clockOut: Date | null; workHours: number | null }>).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0">
                    <span className="text-sm font-medium text-midnight-charcoal">{r.user.name ?? r.user.email}</span>
                    <div className="flex items-center gap-3 text-sm text-smoke-gray">
                      <div className="flex items-center gap-1.5">
                        <span>출근 {r.clockIn ? format(new Date(r.clockIn), "HH:mm") : "—"}</span>
                        {isLate(r.clockIn) && <Badge className="bg-orange-100 text-orange-600 border-orange-200 text-[10px] py-0">지각</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>퇴근 {r.clockOut ? format(new Date(r.clockOut), "HH:mm") : "근무 중"}</span>
                        {isOvertime(r.clockOut) && <Badge className="bg-purple-100 text-purple-600 border-purple-200 text-[10px] py-0">야근</Badge>}
                      </div>
                      {r.workHours && <Badge variant="outline">{r.workHours.toFixed(1)}h</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 관리자: 월별 전체 직원 조회 */}
      {isAdmin && <AdminMonthlyPanel />}

      {/* 이번 달 기록 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            {format(now, "M월", { locale: ko })} 근태 기록
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyRecords.length === 0 ? (
            <p className="text-sm text-smoke-gray">이번 달 기록이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {monthlyRecords.map((r) => {
                const ci = r.clockIn ? new Date(r.clockIn) : null;
                const co = r.clockOut ? new Date(r.clockOut) : null;
                const missingClockOut = !!ci && !co;
                const late = isLate(ci);
                const ot = isOvertime(co);
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0 text-sm">
                    <div className="flex items-center gap-2">
                      {missingClockOut && (
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" title="퇴근 미기록" />
                      )}
                      <span className="font-medium text-midnight-charcoal">
                        {format(new Date(r.date), "M/d (eee)", { locale: ko })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-smoke-gray flex-wrap justify-end">
                      <div className="flex items-center gap-1.5">
                        <span>출근 {ci ? format(ci, "HH:mm") : "—"}</span>
                        {late && <Badge className="bg-orange-100 text-orange-600 border-orange-200 text-[10px] py-0">지각</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={missingClockOut ? "text-yellow-500 font-medium" : ""}>
                          퇴근 {co ? format(co, "HH:mm") : "미기록"}
                        </span>
                        {ot && <Badge className="bg-purple-100 text-purple-600 border-purple-200 text-[10px] py-0">야근</Badge>}
                      </div>
                      <span className="w-14 text-right">{r.workHours ? `${r.workHours.toFixed(1)}h` : "—"}</span>
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
