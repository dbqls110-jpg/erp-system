import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeaveApplyButton } from "./LeaveApplyButton";
import { LeaveAdminPanel } from "./LeaveAdminPanel";
import { LeaveCancelButton } from "./LeaveCancelButton";

const typeLabel: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};
const statusLabel: Record<string, { label: string; class: string }> = {
  pending: { label: "승인 대기", class: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  approved: { label: "승인", class: "bg-green-50 text-green-700 border-green-200" },
  rejected: { label: "반려", class: "bg-red-50 text-red-700 border-red-200" },
};

export default async function LeavePage() {
  const session = await getServerSession(authOptions);
  const year = new Date().getFullYear();
  const isAdmin = session?.user?.role === "admin";

  const [balance, myRequests, allPending, allRequests] = await Promise.all([
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session!.user.id, year } },
    }),
    prisma.leaveRequest.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    isAdmin
      ? prisma.leaveRequest.findMany({
          where: { status: "pending" },
          include: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    // 전체 직원 휴가 내역 (승인된 것만)
    prisma.leaveRequest.findMany({
      where: { status: "approved" },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { startDate: "desc" },
      take: 30,
    }),
  ]);

  const totalDays = balance?.totalDays ?? 15;
  const usedDays = balance?.usedDays ?? 0;
  const pendingDays = balance?.pendingDays ?? 0;
  const remaining = Math.max(0, totalDays - usedDays - pendingDays);
  const isOverused = totalDays - usedDays - pendingDays < 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
          휴가 관리
        </h1>
        <LeaveApplyButton />
      </div>

      {/* 내 휴가 현황 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "총 부여 휴가", value: `${totalDays}일`, color: "text-deep-space-charcoal" },
          { label: "사용 완료", value: `${usedDays}일`, color: "text-smoke-gray" },
          { label: "승인 대기", value: `${pendingDays}일`, color: pendingDays > 0 ? "text-warm-fade" : "text-smoke-gray" },
          { label: "사용 가능", value: `${remaining}일`, color: isOverused ? "text-destructive" : "text-deep-violet" },
        ].map((item) => (
          <Card key={item.label} className="border-ash-gray shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-smoke-gray">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 관리자: 승인 대기 */}
      {isAdmin && allPending.length > 0 && (
        <LeaveAdminPanel requests={allPending as Parameters<typeof LeaveAdminPanel>[0]["requests"]} />
      )}

      {/* 전체 직원 휴가 현황 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            전체 직원 휴가 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allRequests.length === 0 ? (
            <p className="text-sm text-smoke-gray">승인된 휴가가 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {allRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-midnight-charcoal w-16 shrink-0">
                      {(r as typeof r & { user: { name: string | null } }).user.name ?? "직원"}
                    </span>
                    <span className="text-smoke-gray">{typeLabel[r.type]}</span>
                    <span className="text-smoke-gray">
                      {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                    </span>
                    {r.reason && <span className="text-smoke-gray hidden sm:inline">· {r.reason}</span>}
                  </div>
                  <span className="text-smoke-gray shrink-0">{r.days}일</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 내 휴가 신청 내역 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            내 휴가 신청 내역
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myRequests.length === 0 ? (
            <p className="text-sm text-smoke-gray">신청 내역이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {myRequests.map((r) => {
                const s = statusLabel[r.status] ?? statusLabel.pending;
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-ash-gray last:border-0 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-midnight-charcoal">{typeLabel[r.type]}</span>
                      <span className="text-smoke-gray">
                        {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                      </span>
                      {r.reason && <span className="text-smoke-gray hidden sm:inline">· {r.reason}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-smoke-gray">{r.days}일</span>
                      <Badge variant="outline" className={s.class}>{s.label}</Badge>
                      {r.status === "pending" && <LeaveCancelButton id={r.id} />}
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
