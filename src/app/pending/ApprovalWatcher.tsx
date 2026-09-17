"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 승인되면 알아서 들어가게 한다.
 *
 * /api/auth/session 을 부르면 NextAuth 가 jwt 콜백을 돌려 DB 의 최신 role 을 읽고
 * 쿠키도 새로 써 준다(서버 컴포넌트는 쿠키를 못 쓴다). 그래서 이 폴링이 곧
 * "쿠키 갱신"이기도 하다. role 이 pending 이 아니게 되면 대시보드로 보낸다.
 */
const POLL_MS = 20_000;

export function ApprovalWatcher() {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) return;
        const session = (await res.json()) as { user?: { role?: string } } | null;
        const role = session?.user?.role;
        if (!stopped && role && role !== "pending") router.replace("/dashboard");
      } catch {
        // 다음 주기에 다시 본다.
      }
    };
    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);
  return <p className="text-xs text-muted-foreground">승인되면 자동으로 이동합니다.</p>;
}
