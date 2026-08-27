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
import { useEffect, useRef } from "react";
import { useMessenger } from "@/lib/messenger-store";

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

const roleLabel: Record<string, { label: string }> = {
  admin: { label: "관리자" },
  manager: { label: "팀장" },
  member: { label: "사원" },
  partner: { label: "파트너" },
  // 레벨 도입 전의 값. 아직 살아 있는 세션 토큰이 이 값을 들고 온다.
  user: { label: "사원" },
  pending: { label: "승인 대기" },
};

export function Header({ user, onMobileMenuOpen }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  // 미읽음 수는 MessengerProvider 가 이미 가져오는 대화 목록에서 나온다.
  // 예전에는 여기서 /api/messenger/unread 를 따로 30초마다 폴링했는데, 그 응답은
  // /conversations 의 대화별 unread 합계와 같은 값이었다. 요청 하나가 통째로 낭비였다.
  const { unreadTotal: unread, refresh } = useMessenger();

  // 페이지 이동 시 즉시 갱신한다. 주기 폴링과 탭 가시성 게이팅은
  // MessengerProvider의 useVisiblePolling이 중앙에서 담당한다.
  const visibleRef = useRef(true);
  useEffect(() => {
    const onVisibilityChange = () => {
      visibleRef.current = document.visibilityState === "visible";
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (visibleRef.current) void refresh();
  }, [pathname, refresh]);
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
    <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border bg-background shrink-0">
      <div className="flex items-center gap-3">
        {onMobileMenuOpen && (
          <button
            onClick={onMobileMenuOpen}
            className="lg:hidden text-muted-foreground hover:text-foreground p-1"
          >
            <Menu size={20} />
          </button>
        )}
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/messenger" className="relative text-muted-foreground hover:text-primary transition-colors">
          <MessageCircle size={20} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center font-bold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        {user.role === "admin" ? (
          <Link href="/admin">
            <Badge variant="outline" className="hidden sm:inline-flex cursor-pointer hover:opacity-80 transition-opacity">
              {role.label}
            </Badge>
          </Link>
        ) : (
          <Badge variant="outline" className="hidden sm:inline-flex">{role.label}</Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
              <AvatarFallback className="text-xs bg-muted text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-0">
            {/* 프로필 헤더 */}
            <div className="flex flex-col items-center gap-2 px-4 py-5 border-b border-border">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
                <AvatarFallback className="text-xl bg-muted text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
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
                <ExternalLink size={11} className="ml-auto text-muted-foreground" />
              </DropdownMenuItem>
            </div>
            <div className="border-t border-border py-1">
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
