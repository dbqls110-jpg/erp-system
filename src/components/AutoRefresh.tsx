"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function isUserTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
}

export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tryRefresh = () => {
      // 탭 비활성 or 입력 중이면 건너뜀
      if (document.hidden || isUserTyping()) return;
      router.refresh();
    };

    const id = setInterval(tryRefresh, intervalMs);

    // 탭으로 돌아올 때도 한 번 갱신
    const onVisible = () => { if (!document.hidden && !isUserTyping()) router.refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
