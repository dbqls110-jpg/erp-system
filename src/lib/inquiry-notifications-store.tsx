"use client";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { markInquiryRead } from "@/app/actions/inquiryRead";

type Counts = { customer: number; "space-registration": number; "space-rental": number; total: number };
const EMPTY: Counts = { customer: 0, "space-registration": 0, "space-rental": 0, total: 0 };
const InquiryNotifications = createContext({ enabled: false, counts: EMPTY, failed: false, markRead: async (keys: string[]): Promise<void> => { void keys; } });

export function InquiryNotificationsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [counts, setCounts] = useState(EMPTY);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const readQueue = useRef(Promise.resolve());
  const pendingReads = useRef(0);
  useVisiblePolling(async () => {
    if (!enabled || document.visibilityState !== "visible" || busy.current || pendingReads.current > 0) return;
    const current = generation.current;
    busy.current = true;
    try {
      const response = await fetch("/api/inquiries/notifications", { cache: "no-store" });
      if (!response.ok) throw Error("notifications");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("total" in value) || !("customer" in value) || !("space-registration" in value) || !("space-rental" in value)
        || ![value.total, value.customer, value["space-registration"], value["space-rental"]].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) throw Error("notifications");
      if (typeof value.total !== "number" || typeof value.customer !== "number" || typeof value["space-registration"] !== "number" || typeof value["space-rental"] !== "number") throw Error("notifications");
      if (current === generation.current) { setCounts({ total: value.total, customer: value.customer, "space-registration": value["space-registration"], "space-rental": value["space-rental"] }); setFailed(false); }
    } catch { if (current === generation.current) setFailed(true); }
    finally { busy.current = false; }
  }, 30_000, { refreshKey: enabled });
  const markRead = async (keys: string[]) => {
    if (!enabled) return;
    pendingReads.current++;
    const work = readQueue.current.then(async () => {
      generation.current++;
      try {
        for (let offset = 0; offset < keys.length; offset += 500) setCounts(await markInquiryRead(keys.slice(offset, offset + 500)));
        setFailed(false);
      } catch { setFailed(true); throw Error("문의 확인 상태를 저장하지 못했습니다."); }
      finally { generation.current++; pendingReads.current--; }
    });
    readQueue.current = work.catch(() => undefined);
    return work;
  };
  return <InquiryNotifications.Provider value={{ enabled, counts: enabled ? counts : EMPTY, failed, markRead }}>{children}</InquiryNotifications.Provider>;
}
export const useInquiryNotifications = () => useContext(InquiryNotifications);
