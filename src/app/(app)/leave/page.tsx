import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireMenuAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toneBadgeClass } from "@/lib/badge-tone";
import { CalendarOff } from "lucide-react";
import { LeaveApplyButton } from "./LeaveApplyButton";
import { LeaveAdminPanel } from "./LeaveAdminPanel";
import { LeaveCancelButton } from "./LeaveCancelButton";
import { LeaveDeleteButton } from "./LeaveDeleteButton";
import { LeaveHistoryButton } from "./LeaveHistoryModal";

const typeLabel: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};
const statusLabel: Record<string, { label: string; tone: "amber" | "green" | "red" }> = {
  pending: { label: "승인 대기", tone: "amber" },
  approved: { label: "승인", tone: "green" },
  rejected: { label: "반려", tone: "red" },
};

export default async function LeavePage() {
  const session = await getServerSession(authOptions);
  await requireMenuAccess(session!.user.id, "leave", session!.user.role);
  const year = new Date().getFullYear();
  const isAdmin = session?.user?.role === "admin";

  const [balance, myRequests, allPending, allRequests] = await Promise.all([
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session!.user.id, year } },
      select: { totalDays: true, usedDays: true, pendingDays: true },
    }),
    prisma.leaveRequest.findMany({
      where: { userId: session!.user.id },
      select: { id: true, type: true, startDate: true, endDate: true, startTime: true, endTime: true, days: true, reason: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    isAdmin
      ? prisma.leaveRequest.findMany({
          where: { status: "pending" },
          select: { id: true, type: true, startDate: true, endDate: true, startTime: true, endTime: true, days: true, reason: true, user: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.leaveRequest.findMany({
      where: { status: "approved" },
      select: { id: true, userId: true, type: true, startDate: true, endDate: true, startTime: true, endTime: true, days: true, reason: true, user: { select: { name: true, email: true } } },
      orderBy: { startDate: "desc" },
      take: 50,
    }),
  ]);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const totalDays = balance?.totalDays ?? 15;
  const usedDays = r2(balance?.usedDays ?? 0);
  const pendingDays = r2(balance?.pendingDays ?? 0);
  const remaining = r2(Math.max(0, totalDays - usedDays - pendingDays));
  const isOverused = totalDays - usedDays - pendingDays < 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">휴가를 신청하고 사용 현황과 신청 내역을 확인하세요.</p>
        </div>
        <LeaveApplyButton />
      </div>

      {/* 내 휴가 현황 */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {[
          { label: "총 부여 휴가", value: `${totalDays}일`, color: "text-foreground" },
          { label: "사용 완료", value: `${usedDays}일`, color: "text-muted-foreground" },
          { label: "승인 대기", value: `${pendingDays}일`, color: pendingDays > 0 ? "text-destructive" : "text-muted-foreground" },
          { label: "사용 가능", value: `${remaining}일`, color: isOverused ? "text-destructive" : "text-primary" },
        ].map((item) => (
          <Card key={item.label} className="@container/card h-full shadow-xs">
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${item.color}`}>{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* 관리자: 승인 대기 */}
      {isAdmin && allPending.length > 0 && (
        <LeaveAdminPanel requests={allPending as Parameters<typeof LeaveAdminPanel>[0]["requests"]} />
      )}

      {/* 전체 직원 휴가 현황 */}
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            전체 직원 휴가 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allRequests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CalendarOff className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">승인된 휴가가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {allRequests.map((r) => {
                const req = r as typeof r & { user: { name: string | null }; startTime: string | null; endTime: string | null };
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                    <div className="flex items-center gap-3 flex-wrap">
                      {isAdmin ? (
                        <LeaveHistoryButton
                          userId={(req as typeof req & { userId: string }).userId}
                          name={req.user.name ?? "직원"}
                        />
                      ) : (
                        <span className="font-medium text-foreground w-16 shrink-0">{req.user.name ?? "직원"}</span>
                      )}
                      <span className="text-muted-foreground">{typeLabel[r.type]}</span>
                      <span className="text-muted-foreground">
                        {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                        {r.type === "hourly" && req.startTime && req.endTime && (
                          <span className="ml-1 text-primary">({req.startTime}~{req.endTime})</span>
                        )}
                      </span>
                      {r.reason && <span className="text-muted-foreground hidden sm:inline">· {r.reason}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{Math.round(r.days * 100) / 100}일</span>
                      {isAdmin && (
                        <LeaveDeleteButton
                          id={r.id}
                          label={`${r.startDate} ${typeLabel[r.type] ?? "휴가"}`}
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

      {/* 내 휴가 신청 내역 */}
      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            내 휴가 신청 내역
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myRequests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CalendarOff className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">신청 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {myRequests.map((r) => {
                const s = statusLabel[r.status] ?? statusLabel.pending;
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{typeLabel[r.type]}</span>
                      <span className="text-muted-foreground">
                        {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                        {r.type === "hourly" && r.startTime && r.endTime && (
                          <span className="ml-1 text-primary">({r.startTime}~{r.endTime})</span>
                        )}
                      </span>
                      {r.reason && <span className="text-muted-foreground hidden sm:inline">· {r.reason}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{Math.round(r.days * 100) / 100}일</span>
                      <Badge variant="outline" className={toneBadgeClass(s.tone)}>{s.label}</Badge>
                      {r.status === "pending" && <LeaveCancelButton id={r.id} />}
                      {isAdmin && (
                        <LeaveDeleteButton
                          id={r.id}
                          label={`${r.startDate} ${typeLabel[r.type] ?? "휴가"}`}
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
