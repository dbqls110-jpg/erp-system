"use client";

import { useMemo, useState } from "react";

import { LeaveBalanceInput } from "./LeaveBalanceInput";
import { UserActiveToggle } from "./UserActiveToggle";
import { UserExternalLink } from "./UserExternalLink";
import { UserNameInput } from "./UserNameInput";
import { UserRoleSelect } from "./UserRoleSelect";

export type AdminUserRow = {
  id: string;
  image: string | null;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  partnerId: string | null;
  customerId: string | null;
  venueId: string | null;
  venueName: string | null;
  staffUserId: string | null;
  leaveBalance: {
    totalDays: number;
    usedDays: number;
    pendingDays: number;
  } | null;
};

type Option = { id: string; name: string };

export function AdminUserList({
  users,
  year,
  currentUserId,
  staff,
  partners,
  customers,
}: {
  users: AdminUserRow[];
  year: number;
  currentUserId: string;
  staff: Option[];
  partners: Option[];
  customers: Option[];
}) {
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");

  const visibleUsers = useMemo(
    () => users.filter((user) => status === "all" || (status === "active" ? user.active : !user.active)),
    [users, status],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          활성 계정은 로그인·메신저를 사용할 수 있고, 비활성 계정의 기존 기록은 보존됩니다.
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          상태
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="h-9 rounded-[10px] border border-border bg-background px-3 text-[13px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            aria-label="사용자 상태 필터"
          >
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
            <option value="all">전체</option>
          </select>
        </label>
      </div>

      <p className="text-sm">
        표시 <span className="font-semibold text-primary">{visibleUsers.length}</span>명
        {visibleUsers.length !== users.length && <span className="ml-1 text-muted-foreground">(전체 {users.length}명)</span>}
      </p>

      {visibleUsers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          해당 상태의 사용자가 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleUsers.map((user) => {
            const balance = user.leaveBalance;
            const isCurrentUser = user.id === currentUserId;
            return (
              <div key={`${user.id}-${user.active}`} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0 max-lg:flex-wrap">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {(user.name ?? user.email ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <UserNameInput userId={user.id} name={user.name ?? ""} />
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
                  <UserActiveToggle
                    userId={user.id}
                    name={user.name ?? user.email}
                    initialActive={user.active}
                    isCurrentUser={isCurrentUser}
                  />
                  <LeaveBalanceInput
                    userId={user.id}
                    year={year}
                    totalDays={balance?.totalDays ?? 15}
                    usedDays={balance?.usedDays ?? 0}
                    pendingDays={balance?.pendingDays ?? 0}
                  />
                  <UserRoleSelect userId={user.id} currentRole={user.role} isCurrentUser={isCurrentUser} />
                  <UserExternalLink
                    userId={user.id}
                    isCurrentUser={isCurrentUser}
                    role={user.role}
                    partnerId={user.partnerId}
                    customerId={user.customerId}
                    venueId={user.venueId}
                    venueName={user.venueName}
                    staffUserId={user.staffUserId}
                    staff={staff.filter((candidate) => candidate.id !== user.id)}
                    partners={partners}
                    customers={customers}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
