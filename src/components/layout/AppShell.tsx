"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MessengerProvider } from "@/lib/messenger-store";
import { MessengerDock } from "@/components/messenger/MessengerDock";
import { InquiryNotificationsProvider } from "@/lib/inquiry-notifications-store";

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
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!mobileOpen) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [mobileOpen]);

  // 메신저 전체 화면에서는 플로팅 위젯을 띄우지 않는다. 같은 대화가 두 번 보이고
  // 버튼이 입력창을 가린다.
  const onMessengerPage = pathname === "/messenger" || pathname.startsWith("/messenger/");

  return (
    // Provider 가 대화 목록을 한 번만 폴링하고 헤더 배지 · 위젯 · 메신저 페이지가
    // 그 결과를 나눠 쓴다. 각자 폴링하면 요청이 화면 수만큼 늘어난다.
    <MessengerProvider>
    <InquiryNotificationsProvider enabled={allowedMenus?.includes("inquiries") === true}>
      <div className="flex h-screen overflow-hidden bg-background">
        <a href="#main-content" className="sr-only z-[100] rounded-md bg-background p-3 text-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus-visible:ring-2 focus-visible:ring-ring">본문으로 건너뛰기</a>
        {/* 데스크톱 사이드바 */}
        <div className="hidden lg:block shrink-0">
          <Sidebar role={user.role} allowedMenus={allowedMenus} />
        </div>

        {/* 모바일 사이드바 오버레이 */}
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
            <Dialog.Popup id="mobile-navigation" finalFocus={mobileMenuTriggerRef} className="fixed inset-y-0 left-0 z-50 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain bg-sidebar outline-none">
              <Dialog.Title className="sr-only">업무 메뉴</Dialog.Title>
              <Dialog.Description className="sr-only">메뉴를 선택하거나 Escape 키로 닫을 수 있습니다.</Dialog.Description>
              <Sidebar role={user.role} allowedMenus={allowedMenus} onClose={() => setMobileOpen(false)} />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Header user={user} onMobileMenuOpen={() => setMobileOpen(true)} mobileMenuOpen={mobileOpen} mobileMenuTriggerRef={mobileMenuTriggerRef} />
          <main id="main-content" tabIndex={-1} className="@container/main flex-1 overflow-y-auto p-4 outline-none sm:p-7">{children}</main>
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
    </InquiryNotificationsProvider>
    </MessengerProvider>
  );
}
