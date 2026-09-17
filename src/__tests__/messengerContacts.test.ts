/**
 * 외부인은 담당 직원에게만 — 파트너끼리·호스트→파트너 연락은 막힌다
 */
import { describe, it, expect } from "vitest";
import { canMessage, messengerContactWhere, type ContactUser } from "@/lib/messengerContacts";

const u = (over: Partial<ContactUser & { active: boolean; isAgent: boolean }> & { id: string }): ContactUser & { active: boolean; isAgent: boolean } => ({
  role: "member",
  partnerId: null,
  customerId: null,
  venueId: null,
  staffUserId: null,
  active: true,
  isAgent: false,
  ...over,
});

const staff = u({ id: "s1", role: "member" });
const staff2 = u({ id: "s2", role: "manager" });
const partnerA = u({ id: "pa", role: "partner", partnerId: "p-a", staffUserId: "s1" });
const partnerB = u({ id: "pb", role: "partner", partnerId: "p-b", staffUserId: "s2" });
const host = u({ id: "h1", role: "host", venueId: "v1", staffUserId: "s1" });
const hostNoStaff = u({ id: "h2", role: "host", venueId: "v2" });
const customer = u({ id: "c1", role: "member", customerId: "cust-1", staffUserId: "s2" });

describe("canMessage", () => {
  it("외부인은 자기 담당 직원에게만", () => {
    expect(canMessage(partnerA, staff)).toBe(true);
    expect(canMessage(partnerA, staff2)).toBe(false);
    expect(canMessage(host, staff)).toBe(true);
    expect(canMessage(customer, staff2)).toBe(true);
    expect(canMessage(customer, staff)).toBe(false);
  });
  it("파트너끼리·호스트→파트너·파트너→호스트는 막힌다", () => {
    expect(canMessage(partnerA, partnerB)).toBe(false);
    expect(canMessage(host, partnerA)).toBe(false);
    expect(canMessage(partnerA, host)).toBe(false);
  });
  it("담당 직원이 없으면 아무에게도 못 보낸다(자기 메모는 됨)", () => {
    expect(canMessage(hostNoStaff, staff)).toBe(false);
    expect(canMessage(hostNoStaff, hostNoStaff)).toBe(true);
  });
  it("담당 직원이 외부인이면(설정 실수) 막힌다", () => {
    const weird = u({ id: "pw", role: "partner", partnerId: "p-w", staffUserId: "pb" });
    expect(canMessage(weird, partnerB)).toBe(false);
  });
  it("내부 직원은 직원·외부인 누구에게나", () => {
    expect(canMessage(staff, staff2)).toBe(true);
    expect(canMessage(staff, partnerB)).toBe(true);
    expect(canMessage(staff, host)).toBe(true);
    expect(canMessage(staff, u({ id: "x", role: "pending" }))).toBe(false);
    expect(canMessage(staff, u({ id: "bot", isAgent: true }))).toBe(false);
  });
});

describe("messengerContactWhere", () => {
  it("내부 직원은 전원", () => {
    expect(messengerContactWhere(staff)).toEqual({ active: true, isAgent: false, id: { not: "s1" }, role: { not: "pending" } });
  });
  it("외부인은 담당 직원 한 명, 없으면 아무도", () => {
    expect(messengerContactWhere(partnerA)).toMatchObject({ id: "s1" });
    expect(messengerContactWhere(hostNoStaff)).toMatchObject({ id: "__none__" });
  });
});
