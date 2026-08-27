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
  // 레벨 도입 전의 값. 마이그레이션 전 계정이 "알 수 없음"으로 보이지 않게 남겨둔다.
  user: { label: "사원", class: "bg-primary/10 text-primary border-primary/20" },
  pending: { label: "승인 대기", class: "bg-yellow-50 text-yellow-700 border-yellow-200" },
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
    <Select defaultValue={currentRole === "user" ? "member" : currentRole} onValueChange={handleChange}>
      <SelectTrigger className="w-32 h-8 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">관리자</SelectItem>
        <SelectItem value="manager">팀장</SelectItem>
        <SelectItem value="member">사원</SelectItem>
        <SelectItem value="partner">파트너</SelectItem>
        <SelectItem value="pending">승인 대기</SelectItem>
      </SelectContent>
    </Select>
  );
}
