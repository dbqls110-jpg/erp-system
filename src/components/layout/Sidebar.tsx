"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  Handshake,
  LayoutDashboard,
  MapPin,
  Clock,
  Calendar,
  FolderKanban,
  CalendarDays,
  Banknote,
  Settings,
  MessageCircle,
  KeyRound,
  Sheet,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  /** permissions.ts 의 MENU_KEYS 와 대응. 레벨별 접근 제어에 쓰인다. */
  menuKey: string;
}

interface NavGroup {
  /** 라벨이 없으면 그룹 헤더를 렌더하지 않는다 (정본: 첫 그룹은 라벨 없음) */
  label?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [{ label: "대시보드", href: "/dashboard", icon: LayoutDashboard, menuKey: "dashboard" }],
  },
  {
    label: "인사",
    items: [
      { label: "근태 관리", href: "/attendance", icon: Clock, menuKey: "attendance" },
      { label: "휴가 관리", href: "/leave", icon: Calendar, menuKey: "leave" },
    ],
  },
  {
    label: "업무",
    items: [
      { label: "프로젝트", href: "/projects", icon: FolderKanban, menuKey: "projects" },
      { label: "캘린더", href: "/calendar", icon: CalendarDays, menuKey: "calendar" },
      { label: "메신저", href: "/messenger", icon: MessageCircle, menuKey: "messenger" },
    ],
  },
  {
    label: "회사",
    items: [
      { label: "거래처", href: "/customers", icon: Building2, menuKey: "customers" },
      { label: "파트너", href: "/partners", icon: Handshake, menuKey: "partners" },
      { label: "공간 DB", href: "/venues", icon: MapPin, menuKey: "venues" },
      { label: "재무 관리", href: "/finance", icon: Banknote, menuKey: "finance" },
      { label: "구글 시트", href: "/sheets", icon: Sheet, menuKey: "sheets" },
      { label: "ID 관리", href: "/credentials", icon: KeyRound, menuKey: "credentials" },
    ],
  },
];

/** 하단 밀착 그룹 (정본: mt-auto) */
const navSecondary: NavItem[] = [
  { label: "관리자", href: "/admin", icon: Settings, adminOnly: true, menuKey: "admin" },
];

interface SidebarProps {
  role?: string;
  onClose?: () => void;
  /**
   * 서버에서 계산한 접근 가능 메뉴 key 목록.
   * undefined 면 제한하지 않는다(권한 설정 전 하위 호환 — 화면이 잠기면 안 된다).
   */
  allowedMenus?: string[];
}

export function Sidebar({ role, onClose, allowedMenus }: SidebarProps) {
  const pathname = usePathname();

  const allowed = allowedMenus ? new Set(allowedMenus) : null;
  const visible = (item: NavItem) => {
    if (item.adminOnly && role !== "admin") return false;
    // allowedMenus 가 없으면 제한하지 않는다(설정 전 잠금 방지).
    return allowed ? allowed.has(item.menuKey) : true;
  };
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 w-full items-center gap-2 overflow-hidden rounded-xl px-3 text-left text-sm whitespace-nowrap transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80"
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const secondary = navSecondary.filter(visible);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      {/* 브랜드 */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 text-base font-semibold tracking-tight transition-colors hover:text-primary"
          style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}
        >
          <LayoutDashboard className="size-5 shrink-0" />
          <span className="truncate">천우영 시스템</span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="사이드바 닫기"
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* 내비게이션 */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-2">
        {navGroups.map((group, gi) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={group.label ?? `g${gi}`} className={cn(group.label && "py-1")}>
              {group.label && (
                <div className="flex h-8 shrink-0 items-center rounded-xl px-3 text-xs font-medium text-sidebar-foreground/70">
                  {group.label}
                </div>
              )}
              <div className="flex flex-col gap-1">{items.map(renderItem)}</div>
            </div>
          );
        })}

        {secondary.length > 0 && (
          <div className="mt-auto flex flex-col gap-1 pt-2">
            {secondary.map(renderItem)}
          </div>
        )}
      </nav>
    </aside>
  );
}
