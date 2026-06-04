"use client";

import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LogOut, Menu, Mail, ExternalLink, LayoutDashboard, MessageCircle } from "lucide-react";
import { clockOut } from "@/app/actions/attendance";
import { useEffect, useState } from "react";

const pageTitle: Record<string, string> = {
  "/dashboard": "대시보드",
  "/attendance": "근태 관리",
  "/leave": "휴가 관리",
  "/projects": "프로젝트",
  "/calendar": "캘린더",
  "/business-cards": "명함 관리",
  "/finance": "재무 관리",
  "/admin": "관리자",
  "/messenger": "메신저",
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
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const fetch_ = () =>
      fetch("/api/messenger/unread").then(r => r.json()).then(d => setUnread(d.count ?? 0)).catch(() => {});
    fetch_();
    const id = setInterval(fetch_, 10000);
    return () => clearInterval(id);
  }, []);
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
        <Link href="/messenger" className="relative text-smoke-gray hover:text-deep-violet transition-colors">
          <MessageCircle size={20} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-warm-fade text-white text-[10px] flex items-center justify-center font-bold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        {user.role === "admin" ? (
          <Link href="/admin">
            <Badge variant="outline" className={`hidden sm:inline-flex cursor-pointer hover:opacity-80 transition-opacity ${role.class}`}>
              {role.label}
            </Badge>
          </Link>
        ) : (
          <Badge variant="outline" className={`hidden sm:inline-flex ${role.class}`}>{role.label}</Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-deep-violet">
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
              <AvatarFallback className="text-xs bg-hint-of-sky text-midnight-charcoal">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-0">
            {/* 프로필 헤더 */}
            <div className="flex flex-col items-center gap-2 px-4 py-5 border-b border-ash-gray">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
                <AvatarFallback className="text-xl bg-hint-of-sky text-midnight-charcoal">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="text-sm font-semibold text-deep-space-charcoal">{user.name}</p>
                <p className="text-xs text-smoke-gray">{user.email}</p>
              </div>
            </div>
            {/* 메뉴 */}
            <div className="py-1">
              <DropdownMenuItem
                className="gap-2 cursor-pointer mx-1 rounded-lg"
                onClick={() => router.push("/dashboard")}
              >
                <LayoutDashboard size={14} />
                대시보드
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 cursor-pointer mx-1 rounded-lg"
                onClick={() => window.open("https://mail.google.com", "_blank")}
              >
                <Mail size={14} />
                Gmail 바로가기
                <ExternalLink size={11} className="ml-auto text-smoke-gray" />
              </DropdownMenuItem>
            </div>
            <div className="border-t border-ash-gray py-1">
              <DropdownMenuItem
                className="gap-2 cursor-pointer mx-1 rounded-lg text-destructive focus:text-destructive"
                onClick={handleLogout}
              >
                <LogOut size={14} />
                로그아웃 (퇴근 처리)
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
