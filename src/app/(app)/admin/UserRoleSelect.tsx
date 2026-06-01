"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserRole } from "@/app/actions/admin";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const roleConfig: Record<string, { label: string; class: string }> = {
  admin: { label: "관리자", class: "bg-deep-violet/10 text-deep-violet border-deep-violet/20" },
  user: { label: "직원", class: "bg-electric-blue/10 text-electric-blue border-electric-blue/20" },
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
    <Select defaultValue={currentRole} onValueChange={handleChange}>
      <SelectTrigger className="w-32 h-8 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">관리자</SelectItem>
        <SelectItem value="user">직원</SelectItem>
        <SelectItem value="pending">승인 대기</SelectItem>
      </SelectContent>
    </Select>
  );
}
