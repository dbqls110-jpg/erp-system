import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

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

  const totalHours = records.reduce((s, r) => s + (r.workHours ?? 0), 0);
  const workDays = records.filter(r => r.clockIn).length;

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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/attendance" className="text-smoke-gray hover:text-midnight-charcoal transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
            {user.name ?? user.email} 근태 기록
          </h1>
          <p className="text-sm text-smoke-gray">{year}년 {month}월</p>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-1"><p className="text-xs font-medium text-smoke-gray">출근일수</p></CardHeader>
          <CardContent><p className="text-2xl font-bold text-deep-space-charcoal">{workDays}일</p></CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-1"><p className="text-xs font-medium text-smoke-gray">총 근무시간</p></CardHeader>
          <CardContent><p className="text-2xl font-bold text-deep-violet">{totalHours.toFixed(1)}h</p></CardContent>
        </Card>
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-1"><p className="text-xs font-medium text-smoke-gray">일 평균</p></CardHeader>
          <CardContent><p className="text-2xl font-bold text-electric-blue">{workDays > 0 ? (totalHours / workDays).toFixed(1) : "0"}h</p></CardContent>
        </Card>
      </div>

      {/* 일별 기록 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
              일별 근태 기록
            </CardTitle>
            <div className="flex items-center gap-1 text-sm">
              <Link href={`/attendance/${userId}${prevMonth}`} className="p-1 text-smoke-gray hover:text-deep-violet transition-colors">‹</Link>
              <span className="text-midnight-charcoal font-medium px-2">{year}년 {month}월</span>
              <Link href={`/attendance/${userId}${nextMonth}`} className="p-1 text-smoke-gray hover:text-deep-violet transition-colors">›</Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-smoke-gray">이번 달 근태 기록이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-ash-gray last:border-0 text-sm">
                  <span className="font-medium text-midnight-charcoal w-28 shrink-0">{dayLabel(r.date)}</span>
                  <div className="flex items-center gap-4 text-smoke-gray">
                    <span>출근 <span className="text-midnight-charcoal font-medium">{fmt(r.clockIn)}</span></span>
                    <span>퇴근 <span className="text-midnight-charcoal font-medium">{fmt(r.clockOut)}</span></span>
                    {r.workHours != null && (
                      <Badge variant="outline" className="text-xs">{r.workHours.toFixed(1)}h</Badge>
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
