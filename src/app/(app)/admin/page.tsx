import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DriveIndexPanel, type DriveIndexInitialStatus } from "./DriveIndexPanel";
import AccessLevelPanel from "./AccessLevelPanel";
import { AdminUserList, type AdminUserRow } from "./AdminUserList";

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
        active: true,
        partnerId: true,
        customerId: true,
        venueId: true,
        venue: { select: { name: true, district: true } },
        staffUserId: true,
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

  const adminUsers: AdminUserRow[] = users.map((user) => ({
    id: user.id,
    image: user.image,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    partnerId: user.partnerId,
    customerId: user.customerId,
    venueId: user.venueId,
    venueName: user.venue ? (user.venue.district ? `${user.venue.name} · ${user.venue.district}` : user.venue.name) : null,
    staffUserId: user.staffUserId,
    leaveBalance: user.leaveBalances[0]
      ? {
          totalDays: user.leaveBalances[0].totalDays,
          usedDays: user.leaveBalances[0].usedDays,
          pendingDays: user.leaveBalances[0].pendingDays,
        }
      : null,
  }));
  const staff = adminUsers
    .filter((user) => user.active && ["admin", "manager", "member", "user"].includes(user.role)
      && !user.partnerId && !user.customerId && !user.venueId)
    .map((user) => ({ id: user.id, name: user.name ?? user.email ?? user.id }));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-muted-foreground">Google Drive AI 검색과 사용자 관리 설정을 확인하고 관리합니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Google Drive AI 검색
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DriveIndexPanel initialStatus={driveIndexStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            사용자 관리 ({users.length}명)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUserList
            users={adminUsers}
            year={year}
            currentUserId={session.user.id}
            staff={staff}
            partners={partners}
            customers={customers}
          />
        </CardContent>
      </Card>

      {/* 권한 레벨 · 메뉴별 접근 설정 */}
      <AccessLevelPanel />
    </div>
  );
}
