/**
 * 출근 자동 기록은 직원만
 */
import { describe, it, expect } from "vitest";
import { becameInternal, shouldAutoClockIn } from "@/lib/autoAttendance";

const base = { partnerId: null, customerId: null, venueId: null };

describe("shouldAutoClockIn", () => {
  it("관리자·팀장·사원(옛 user)은 찍는다", () => {
    for (const role of ["admin", "manager", "member", "user"]) expect(shouldAutoClockIn({ role, ...base })).toBe(true);
  });
  it("파트너·공간 호스트·승인 대기는 안 찍는다", () => {
    for (const role of ["partner", "host", "pending", null, undefined]) expect(shouldAutoClockIn({ role, ...base })).toBe(false);
  });
  it("레벨은 사원인데 파트너사·거래처·공간에 연결돼 있으면 안 찍는다", () => {
    expect(shouldAutoClockIn({ role: "member", ...base, partnerId: "p" })).toBe(false);
    expect(shouldAutoClockIn({ role: "member", ...base, customerId: "c" })).toBe(false);
    expect(shouldAutoClockIn({ role: "manager", ...base, venueId: "v" })).toBe(false);
  });
});

describe("becameInternal", () => {
  it("승인 대기 → 팀장이 되면 그때 출근을 찍는다", () => {
    expect(becameInternal("pending", { role: "manager", ...base })).toBe(true);
  });
  it("승인 대기 → 파트너는 안 찍고, 이미 직원이던 사람의 갱신도 안 찍는다", () => {
    expect(becameInternal("pending", { role: "partner", ...base })).toBe(false);
    expect(becameInternal("member", { role: "member", ...base })).toBe(false);
  });
});
