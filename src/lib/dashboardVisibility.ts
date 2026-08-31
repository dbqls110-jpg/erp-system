import { isExternal, type Viewer } from "@/lib/calendarVisibility";

export type DashboardAudience = "internal" | "external";

/** 캘린더와 같은 연결 기준을 대시보드의 외부 사용자 분기에도 쓰기 위해 순수하게 판정한다. */
export function getDashboardAudience(viewer: Viewer): DashboardAudience {
  return isExternal(viewer) ? "external" : "internal";
}
