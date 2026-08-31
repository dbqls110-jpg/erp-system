"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MessengerProvider } from "@/lib/messenger-store";
import { MessengerDock } from "@/components/messenger/MessengerDock";

interface AppShellProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: string;
  };
  /** 로그인한 사용자 id. 메신저에서 내 메시지와 상대 메시지를 가르는 데 쓴다. */
  userId: string;
  children: React.ReactNode;
  /** 서버에서 계산한 접근 가능 메뉴 key 목록 */
  allowedMenus?: string[];
}

export function AppShell({ user, userId, children, allowedMenus }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // 메신저 전체 화면에서는 플로팅 위젯을 띄우지 않는다. 같은 대화가 두 번 보이고
  // 버튼이 입력창을 가린다.
  const onMessengerPage = pathname === "/messenger" || pathname.startsWith("/messenger/");

  return (
    // Provider 가 대화 목록을 한 번만 폴링하고 헤더 배지 · 위젯 · 메신저 페이지가
    // 그 결과를 나눠 쓴다. 각자 폴링하면 요청이 화면 수만큼 늘어난다.
    <MessengerProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* 데스크톱 사이드바 */}
        <div className="hidden lg:block shrink-0">
          <Sidebar role={user.role} allowedMenus={allowedMenus} />
        </div>

        {/* 모바일 사이드바 오버레이 */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
              <Sidebar role={user.role} allowedMenus={allowedMenus} onClose={() => setMobileOpen(false)} />
            </div>
          </>
        )}

        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Header user={user} onMobileMenuOpen={() => setMobileOpen(true)} />
          <main className="@container/main flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>

      {!onMessengerPage && (
        <MessengerDock
          myId={userId}
          myUser={{
            id: userId,
            name: user.name ?? null,
            image: user.image ?? null,
          }}
        />
      )}
    </MessengerProvider>
  );
}
