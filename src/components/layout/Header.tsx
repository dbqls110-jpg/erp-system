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
  "/company-finance": "회사 매출·매입",
  "/customers": "거래처 관리",
  "/partners": "파트너 관리",
  "/venues": "공간 DB",
  "/credentials": "ID 관리",
  "/sheets": "구글 시트",
  "/projects/stats": "프로젝트 통계",
  "/inquiries": "문의",
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
  const title = Object.entries(pageTitle)
    .sort(([left], [right]) => right.length - left.length)
    .find(([key]) => pathname === key || pathname.startsWith(key + "/"))?.[1] ?? "";
  useEffect(() => {
    const baseTitle = title ? `${title} | 사내 ERP 시스템` : "사내 ERP 시스템";
    let blinkOn = false;

    const applyTitle = () => {
      // 브라우저 최상단 탭은 웹 페이지에서 색을 직접 바꿀 수 없으므로
      // 미읽음이 있는 동안 탭 제목을 번갈아 보여 새 메시지를 알린다.
      const isBackgroundTab = document.visibilityState === "hidden";
      const nextTitle = unread > 0
        ? (isBackgroundTab && blinkOn ? `🔴 새 메시지 ${unread}건` : baseTitle)
        : baseTitle;
      if (document.title !== nextTitle) document.title = nextTitle;
    };

    const onVisibilityChange = () => {
      // 탭을 다시 열면 원래 화면 제목으로 돌린다. 미읽음 배지는 앱 헤더에서
      // 계속 보여 주므로 사용자가 알림을 놓치지 않는다.
      blinkOn = false;
      applyTitle();
    };

    // Next's metadata manager can restore the root title after hydration. Keep
    // the visible browser title aligned with the route without changing the DOM
    // markup used for the server render.
    applyTitle();
    const titleElement = document.querySelector("title");
    const blinkId = unread > 0
      ? window.setInterval(() => {
        if (document.visibilityState === "hidden") {
          blinkOn = !blinkOn;
          applyTitle();
        }
      }, 1200)
      : null;
    const observer = titleElement ? new MutationObserver(applyTitle) : null;
    observer?.observe(titleElement!, { childList: true, characterData: true, subtree: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (blinkId !== null) window.clearInterval(blinkId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer?.disconnect();
    };
  }, [title, unread]);
  const initials = user.name
    ? user.name.slice(0, 2).toUpperCase()
    : user.email?.slice(0, 2).toUpperCase() ?? "?";

  const role = roleLabel[user.role] ?? roleLabel.pending;

  const handleLogout = async () => {
    await clockOut();
    signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-7">
      <div className="flex items-center gap-3">
        {onMobileMenuOpen && (
          <button
            onClick={onMobileMenuOpen}
            aria-label="메뉴 열기"
            className="lg:hidden text-muted-foreground hover:text-foreground p-1"
          >
            <Menu size={20} />
          </button>
        )}
        <h1 className="font-heading text-xl font-bold text-foreground">{title || "사내 ERP 시스템"}</h1>
      </div>
      <div className="flex items-center gap-2.5">
        <Link
          href="/messenger"
          aria-label={unread > 0 ? `메신저, 안 읽은 메시지 ${unread}건` : "메신저"}
          title={unread > 0 ? `새 메시지 ${unread}건` : "메신저"}
          className={[
            "relative inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:text-primary",
            unread > 0 && "bg-destructive/10 text-destructive ring-2 ring-destructive/20 motion-safe:animate-pulse",
          ].filter(Boolean).join(" ")}
        >
          <MessageCircle size={20} aria-hidden="true" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-white shadow-sm"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {unread > 0 ? `안 읽은 메신저 ${unread}건` : "안 읽은 메신저가 없습니다"}
        </span>
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
