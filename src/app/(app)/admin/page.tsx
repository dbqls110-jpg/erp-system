import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRoleSelect } from "./UserRoleSelect";
import { UserExternalLink } from "./UserExternalLink";
import { LeaveBalanceInput } from "./LeaveBalanceInput";
import { UserNameInput } from "./UserNameInput";
import { DriveIndexPanel, type DriveIndexInitialStatus } from "./DriveIndexPanel";
import AccessLevelPanel from "./AccessLevelPanel";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/dashboard");

  const year = new Date().getFullYear();

  const [users, partners, customers, indexFolders, indexedFileCount, indexChunkCount, indexStatusGroups] = await Promise.all([
    prisma.user.findMany({
      // 에이전트 계정은 직원이 아니다. 휴가·역할 설정 대상이 아니므로 목록에서 제외한다.
      where: { isAgent: false },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        image: true,
        name: true,
        email: true,
        role: true,
        partnerId: true,
        customerId: true,
        leaveBalances: { where: { year } },
      },
    }),
    prisma.partner.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.driveIndexFolder.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { files: true } } },
    }),
    prisma.driveIndexFile.count({ where: { status: { not: "deleted" } } }),
    prisma.driveIndexChunk.count(),
    prisma.driveIndexFile.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const driveIndexStatus: DriveIndexInitialStatus = {
    folders: indexFolders.map((folder) => ({
      ...folder,
      lastScannedAt: folder.lastScannedAt?.toISOString() ?? null,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    })),
    totals: {
      files: indexedFileCount,
      chunks: indexChunkCount,
      byStatus: Object.fromEntries(indexStatusGroups.map((group) => [group.status, group._count._all])),
    },
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-muted-foreground">Google Drive AI 검색과 사용자 관리 설정을 확인하고 관리합니다.</p>
      </div>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Google Drive AI 검색
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DriveIndexPanel initialStatus={driveIndexStatus} />
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            사용자 관리 ({users.length}명)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((u) => {
              const balance = u.leaveBalances[0];
              return (
                <div key={u.id} className="flex items-center justify-between py-3 border-b border-border last:border-0 gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={u.image ?? undefined} />
                      <AvatarFallback className="bg-muted text-foreground text-sm">
                        {(u.name ?? u.email ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <UserNameInput userId={u.id} name={u.name ?? ""} />
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <LeaveBalanceInput
                      userId={u.id}
                      year={year}
                      totalDays={balance?.totalDays ?? 15}
                      usedDays={balance?.usedDays ?? 0}
                      pendingDays={balance?.pendingDays ?? 0}
                    />
                    <UserRoleSelect
                      userId={u.id}
                      currentRole={u.role}
                      isCurrentUser={u.id === session.user.id}
                    />
                    <UserExternalLink
                      userId={u.id}
                      isCurrentUser={u.id === session.user.id}
                      partnerId={u.partnerId}
                      customerId={u.customerId}
                      partners={partners}
                      customers={customers}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 권한 레벨 · 메뉴별 접근 설정 */}
      <AccessLevelPanel />
    </div>
  );
}
