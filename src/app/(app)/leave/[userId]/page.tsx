import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

const typeLabel: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};
const statusLabel: Record<string, { label: string; class: string }> = {
  pending: { label: "승인 대기", class: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  approved: { label: "승인", class: "bg-green-50 text-green-700 border-green-200" },
  rejected: { label: "반려", class: "bg-red-50 text-red-700 border-red-200" },
};

export default async function EmployeeLeavePage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/leave");

  const { userId } = await params;
  const year = new Date().getFullYear();

  const [user, balance, requests] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, image: true } }),
    prisma.leaveBalance.findUnique({ where: { userId_year: { userId, year } } }),
    prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!user) notFound();

  const totalDays = balance?.totalDays ?? 15;
  const usedDays = balance?.usedDays ?? 0;
  const pendingDays = balance?.pendingDays ?? 0;
  const remaining = Math.max(0, totalDays - usedDays - pendingDays);

  const usedPercent = totalDays > 0 ? Math.min(Math.round((usedDays / totalDays) * 100), 100) : 0;

  // 유형별 집계
  const byType = requests.reduce((acc, r) => {
    if (r.status === "approved") acc[r.type] = (acc[r.type] ?? 0) + r.days;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/leave" className="text-smoke-gray hover:text-midnight-charcoal transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
            {user.name ?? user.email} 휴가 현황
          </h1>
          <p className="text-sm text-smoke-gray">{year}년 기준</p>
        </div>
      </div>

      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "총 부여", value: `${totalDays}일`, color: "text-deep-space-charcoal" },
          { label: "사용 완료", value: `${usedDays}일`, color: "text-smoke-gray" },
          { label: "승인 대기", value: `${pendingDays}일`, color: pendingDays > 0 ? "text-warm-fade" : "text-smoke-gray" },
          { label: "사용 가능", value: `${remaining}일`, color: remaining <= 3 ? "text-destructive" : "text-deep-violet" },
        ].map((item) => (
          <Card key={item.label} className="border-ash-gray shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-smoke-gray">{item.label}</CardTitle></CardHeader>
            <CardContent><p className={`text-2xl font-bold ${item.color}`}>{item.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 사용 현황 */}
        <div className="space-y-4">
          <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
                사용률
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-smoke-gray">사용 {usedDays}일 / 총 {totalDays}일</span>
                <span className="font-bold text-deep-violet">{usedPercent}%</span>
              </div>
              <div className="w-full bg-ash-gray rounded-full h-2.5">
                <div className="bg-deep-violet h-2.5 rounded-full transition-all" style={{ width: `${usedPercent}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
                유형별 사용
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(byType).length === 0 ? (
                <p className="text-sm text-smoke-gray">사용 내역 없음</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(byType).map(([type, days]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-midnight-charcoal">{typeLabel[type] ?? type}</span>
                      <span className="font-medium text-smoke-gray">{days}일</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽: 전체 신청 내역 */}
        <div className="lg:col-span-2">
          <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
                전체 신청 내역 ({requests.length}건)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <p className="text-sm text-smoke-gray">신청 내역이 없습니다.</p>
              ) : (
                <div className="space-y-1">
                  {requests.map((r) => {
                    const s = statusLabel[r.status] ?? statusLabel.pending;
                    return (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-midnight-charcoal">{typeLabel[r.type]}</span>
                          <span className="text-smoke-gray">
                            {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                            {r.type === "hourly" && r.startTime && r.endTime && (
                              <span className="ml-1 text-electric-blue">({r.startTime}~{r.endTime})</span>
                            )}
                          </span>
                          {r.reason && <span className="text-smoke-gray text-xs hidden sm:inline">· {r.reason}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-smoke-gray">{r.days}일</span>
                          <Badge variant="outline" className={s.class}>{s.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
