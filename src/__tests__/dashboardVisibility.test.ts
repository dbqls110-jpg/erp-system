import { describe, expect, it } from "vitest";
import { getDashboardAudience } from "@/lib/dashboardVisibility";
import type { Viewer } from "@/lib/calendarVisibility";

const staff: Viewer = { id: "u1", role: "member", partnerId: null, customerId: null };
const partner: Viewer = { id: "u2", role: "partner", partnerId: "p1", customerId: null };

describe("대시보드 노출 대상 판정", () => {
  it("연결이 없는 내부 직원은 내부 대시보드를 본다", () => {
    expect(getDashboardAudience(staff)).toBe("internal");
  });

  it("파트너 연결이 있는 계정은 외부 대시보드를 본다", () => {
    expect(getDashboardAudience(partner)).toBe("external");
  });
});
