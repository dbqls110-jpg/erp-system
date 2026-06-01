import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRoleSelect } from "./UserRoleSelect";
import { LeaveBalanceInput } from "./LeaveBalanceInput";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") redirect("/dashboard");

  const year = new Date().getFullYear();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      leaveBalances: { where: { year } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)", letterSpacing: "-0.91px" }}>
        관리자
      </h1>

      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-deep-space-charcoal" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
            사용자 관리 ({users.length}명)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((u) => {
              const balance = u.leaveBalances[0];
              return (
                <div key={u.id} className="flex items-center justify-between py-3 border-b border-ash-gray last:border-0 gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={u.image ?? undefined} />
                      <AvatarFallback className="bg-hint-of-sky text-midnight-charcoal text-sm">
                        {(u.name ?? u.email ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-midnight-charcoal">{u.name ?? "이름 없음"}</p>
                      <p className="text-xs text-smoke-gray">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <LeaveBalanceInput
                      userId={u.id}
                      year={year}
                      totalDays={balance?.totalDays ?? 15}
                      usedDays={balance?.usedDays ?? 0}
                    />
                    <UserRoleSelect
                      userId={u.id}
                      currentRole={u.role}
                      isCurrentUser={u.id === session.user.id}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
