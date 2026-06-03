"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LogOut, Menu } from "lucide-react";
import { clockOut } from "@/app/actions/attendance";

const pageTitle: Record<string, string> = {
  "/dashboard": "대시보드",
  "/attendance": "근태 관리",
  "/leave": "휴가 관리",
  "/projects": "프로젝트",
  "/calendar": "캘린더",
  "/business-cards": "명함 관리",
  "/finance": "재무 관리",
  "/admin": "관리자",
};

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: string;
  };
  onMobileMenuOpen?: () => void;
}

const roleLabel: Record<string, { label: string; class: string }> = {
  admin: { label: "관리자", class: "bg-deep-violet/10 text-deep-violet border-deep-violet/20" },
  user: { label: "직원", class: "bg-electric-blue/10 text-electric-blue border-electric-blue/20" },
  pending: { label: "승인 대기", class: "bg-warm-fade/10 text-warm-fade border-warm-fade/20" },
};

export function Header({ user, onMobileMenuOpen }: HeaderProps) {
  const pathname = usePathname();
  const title = Object.entries(pageTitle).find(([key]) => pathname === key || pathname.startsWith(key + "/"))?.[1] ?? "";
  const initials = user.name
    ? user.name.slice(0, 2).toUpperCase()
    : user.email?.slice(0, 2).toUpperCase() ?? "?";

  const role = roleLabel[user.role] ?? roleLabel.pending;

  const handleLogout = async () => {
    await clockOut();
    signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-ash-gray bg-canvas-white shrink-0">
      <div className="flex items-center gap-3">
        {onMobileMenuOpen && (
          <button
            onClick={onMobileMenuOpen}
            className="lg:hidden text-smoke-gray hover:text-midnight-charcoal p-1"
          >
            <Menu size={20} />
          </button>
        )}
        <p className="text-sm font-semibold text-midnight-charcoal">{title}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={`hidden sm:inline-flex ${role.class}`}>{role.label}</Badge>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-deep-violet">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
              <AvatarFallback className="text-xs bg-hint-of-sky text-midnight-charcoal">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-midnight-charcoal hidden sm:block">
              {user.name ?? user.email}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-smoke-gray truncate">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              로그아웃 (퇴근 처리)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
