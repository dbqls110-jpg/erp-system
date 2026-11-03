import { describe, expect, it } from "vitest";
import { assertCanEditRevenueDates, canEditRevenueDates } from "@/lib/revenueDateAccess";

describe("매출 날짜 본인 계정 제한", () => {
  it.each(["dbqls110@gmail.com", " DBQLS110@gmail.com "])("활성 관리자 본인 계정만 허용한다: %s", email => {
    const user = { email, role: "admin", active: true };
    expect(canEditRevenueDates(user)).toBe(true);
    expect(() => assertCanEditRevenueDates(user)).not.toThrow();
  });
  it.each([
    { email: "another@example.com", role: "admin", active: true },
    { email: "qkrtjrdud952@gmail.com", role: "manager", active: true },
    { email: "dbqls110+alias@gmail.com", role: "admin", active: true },
    { email: "dbqls110@gmail.com", role: "admin", active: false },
    { email: "dbqls110@gmail.com", role: "staff", active: true },
    { email: "dbqls110@gmail.com", role: "dot", active: true },
    { email: null, role: "admin", active: true },
  ])("역할·이메일·활성 여부가 맞지 않으면 버튼과 저장을 모두 거부한다: %j", user => {
    expect(canEditRevenueDates(user)).toBe(false);
    expect(() => assertCanEditRevenueDates(user)).toThrow("본인 계정");
  });
  it("세션이 없으면 노출하지 않는다", () => {
    expect(canEditRevenueDates(null)).toBe(false);
    expect(canEditRevenueDates(undefined)).toBe(false);
  });
});
