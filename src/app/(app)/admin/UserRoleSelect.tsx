"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserRole } from "@/app/actions/admin";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

// 레벨 순서는 access_levels 의 rank 와 같아야 한다(관리자 > 팀장 > 사원 > 파트너).
const roleConfig: Record<string, { label: string; class: string }> = {
  admin: { label: "관리자", class: "bg-primary/10 text-primary border-primary/20" },
  manager: { label: "팀장", class: "bg-primary/10 text-primary border-primary/20" },
  member: { label: "사원", class: "bg-primary/10 text-primary border-primary/20" },
  partner: { label: "파트너", class: "bg-primary/10 text-primary border-primary/20" },
  host: { label: "공간 호스트", class: "bg-primary/10 text-primary border-primary/20" },
  // 레벨 도입 전의 값. 마이그레이션 전 계정이 "알 수 없음"으로 보이지 않게 남겨둔다.
  user: { label: "사원", class: "bg-primary/10 text-primary border-primary/20" },
  pending: { label: "멤버 (설정 전)", class: "bg-yellow-50 text-yellow-700 border-yellow-200" },
};

const ROLE_ITEMS: Record<string, string> = {
  admin: roleConfig.admin.label,
  manager: roleConfig.manager.label,
  member: roleConfig.member.label,
  partner: roleConfig.partner.label,
  host: roleConfig.host.label,
  pending: roleConfig.pending.label,
};

export function UserRoleSelect({ userId, currentRole, isCurrentUser }: {
  userId: string;
  currentRole: string;
  isCurrentUser: boolean;
}) {
  if (isCurrentUser) {
    const r = roleConfig[currentRole] ?? roleConfig.pending;
    return <Badge variant="outline" className={r.class}>{r.label} (나)</Badge>;
  }

  const handleChange = async (role: string | null) => {
    if (!role) return;
    try {
      await updateUserRole(userId, role);
      toast.success("권한이 변경됐습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경 실패");
    }
  };

  return (
    // Base UI 의 SelectValue 는 items 를 주지 않으면 라벨이 아니라 원시값("manager")을 그린다.
    <Select items={ROLE_ITEMS} defaultValue={currentRole === "user" ? "member" : currentRole} onValueChange={handleChange}>
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ROLE_ITEMS).map(([v, l]) => (
          <SelectItem key={v} value={v}>{l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
