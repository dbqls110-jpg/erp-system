"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Clock,
  Calendar,
  FolderKanban,
  CalendarDays,
  CreditCard,
  Banknote,
  Settings,
  MessageCircle,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "근태 관리", href: "/attendance", icon: Clock },
  { label: "휴가 관리", href: "/leave", icon: Calendar },
  { label: "프로젝트", href: "/projects", icon: FolderKanban },
  { label: "캘린더", href: "/calendar", icon: CalendarDays },
  { label: "재무 관리", href: "/finance", icon: Banknote },
  { label: "메신저", href: "/messenger", icon: MessageCircle },
  { label: "관리자", href: "/admin", icon: Settings, adminOnly: true },
];

interface SidebarProps {
  role?: string;
  onClose?: () => void;
}

export function Sidebar({ role, onClose }: SidebarProps) {
  const pathname = usePathname();

  const items = navItems.filter((item) => {
    if (item.adminOnly && role !== "admin") return false;
    return true;
  });

  return (
    <aside className="w-60 shrink-0 flex flex-col h-full border-r border-ash-gray bg-canvas-white">
      {/* 로고 */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-ash-gray shrink-0">
        <Link href="/dashboard" onClick={onClose} className="text-lg font-bold text-deep-space-charcoal tracking-tight hover:text-deep-violet transition-colors" style={{ fontFamily: "var(--font-plus-jakarta-sans)" }}>
          천우영 시스템
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-smoke-gray hover:text-midnight-charcoal lg:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-deep-violet"
                  : "text-midnight-charcoal hover:bg-hint-of-sky hover:text-deep-violet"
              )}
            >
              <item.icon
                size={18}
                className={cn(
                  isActive ? "text-deep-violet" : "text-smoke-gray"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 하단 버전 */}
      <div className="px-6 py-4 border-t border-ash-gray shrink-0">
        <p className="text-xs text-smoke-gray">v1.0.0</p>
      </div>
    </aside>
  );
}
