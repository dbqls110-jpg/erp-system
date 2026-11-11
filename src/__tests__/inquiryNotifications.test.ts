import { beforeEach, describe, expect, it, vi } from "vitest";
import { canReviewInquiries } from "@/lib/inquiryAccess";
import { inquiryKey, parseInquiryReadKeys } from "@/lib/inquiryNotificationKeys";
const m = vi.hoisted(() => ({ session: vi.fn(), menu: vi.fn(), inquiries: vi.fn(), registrations: vi.fn(), rentals: vi.fn(), reads: vi.fn(), create: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ canAccessMenu: m.menu }));
vi.mock("@/lib/prisma", () => ({ prisma: { inquiryReadReceipt: { findMany: m.reads, createMany: m.create } } }));
vi.mock("@/lib/inquirySheet", () => ({ getInquiries: m.inquiries }));
vi.mock("@/lib/spaceRegistrationSheet", () => ({ getSpaceRegistrations: m.registrations }));
vi.mock("@/lib/spaceRentalSheet", () => ({ getSpaceRentals: m.rentals }));
import { getInquiryUnreadCounts, invalidateInquiryNotificationSnapshot, recordInquiryRead, getInquiryNotificationSnapshot } from "@/lib/inquiryNotifications";

const owner = { id: "owner", email: "dbqls110@gmail.com", role: "admin", active: true, partnerId: null, customerId: null };
const identity = { submittedAt: "2026-11-11 13:00", name: "연동 점검", email: "fixture@example.test", phone: "" };
const key = inquiryKey("customer", identity);
beforeEach(() => {
  vi.clearAllMocks(); invalidateInquiryNotificationSnapshot();
  m.session.mockResolvedValue({ user: owner }); m.menu.mockResolvedValue(true);
  m.inquiries.mockResolvedValue([{ identity, status: "문의" }]); m.registrations.mockResolvedValue([]); m.rentals.mockResolvedValue([]);
  m.reads.mockResolvedValue([]); m.create.mockResolvedValue({ count: 1 });
});
describe("문의 대상 계정 제한", () => {
  it("정확한 두 이메일만 허용하고 이름은 권한 판단에 쓰지 않는다", () => {
    expect(canReviewInquiries(owner)).toBe(true);
    expect(canReviewInquiries({ ...owner, email: " QKRTJRDUD952@GMAIL.COM ", role: "manager" })).toBe(true);
    for (const user of [{ ...owner, email: "other@example.test" }, { ...owner, active: false }, { ...owner, role: "partner" },
      { ...owner, partnerId: "external" }, { ...owner, customerId: "customer" }, { ...owner, isAgent: true }, { ...owner, role: "pending" }]) {
      expect(canReviewInquiries(user)).toBe(false);
    }
  });
  it("다른 관리자는 시트나 읽음 DB를 조회하지 않는다", async () => {
    m.session.mockResolvedValue({ user: { ...owner, email: "other@example.test" } });
    await expect(getInquiryUnreadCounts()).rejects.toThrow("Forbidden");
    await expect(recordInquiryRead([key])).rejects.toThrow("Forbidden");
    expect(m.inquiries).not.toHaveBeenCalled(); expect(m.reads).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
});
describe("독립 확인·안전한 시트 읽기", () => {
  it("중복 동시 조회는 시트를 한 번만 읽고, 공간대관 헤더도 쓰지 않는다", async () => {
    const results = await Promise.all([getInquiryUnreadCounts(), getInquiryUnreadCounts(), getInquiryUnreadCounts()]);
    expect(results.every(result => result.total === 1)).toBe(true);
    expect(m.inquiries).toHaveBeenCalledTimes(1); expect(m.rentals).toHaveBeenCalledWith({ ensureHeaders: false });
  });
  it("확인 기록은 클라이언트의 사용자 ID가 아닌 로그인한 사용자로만 저장한다", async () => {
    await recordInquiryRead([key, key]);
    expect(m.create).toHaveBeenCalledWith({ data: [{ userId: "owner", itemKey: key }], skipDuplicates: true });
    m.session.mockResolvedValue({ user: { ...owner, id: "park", email: "qkrtjrdud952@gmail.com" } });
    expect((await getInquiryUnreadCounts()).total).toBe(1);
    expect(m.reads).toHaveBeenLastCalledWith({ where: { userId: "park" }, select: { itemKey: true } });
  });
  it("페이지 이후 새로 생긴 문의는 이전 목록의 확인으로 지우지 않는다", async () => {
    const next = { ...identity, submittedAt: "2026-11-11 13:01" };
    m.inquiries.mockResolvedValue([{ identity, status: "문의" }, { identity: next, status: "문의" }]);
    await recordInquiryRead([key]);
    expect(m.create).toHaveBeenCalledWith({ data: [{ userId: "owner", itemKey: key }], skipDuplicates: true });
  });
  it("시트 오류는 빈 정상 목록으로 바꾸지 않고 실패로 돌려준다", async () => {
    m.inquiries.mockRejectedValue(Error("fixture upstream failure"));
    await expect(getInquiryUnreadCounts()).rejects.toThrow("fixture upstream failure");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("수정으로 캐시를 무효화한 뒤에는 이전 진행 중 읽기가 새 캐시를 덮지 않는다", async () => {
    let release: (value: unknown[]) => void = () => {};
    m.inquiries.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const before = getInquiryNotificationSnapshot();
    invalidateInquiryNotificationSnapshot();
    const after = await getInquiryNotificationSnapshot();
    release([]); await before;
    expect((await getInquiryNotificationSnapshot()).keys).toEqual(after.keys);
  });
  it("키는 행번호·객체 속성순서와 무관하고 원본 개인정보를 노출하지 않는다", () => {
    expect(inquiryKey("customer", { phone: "", email: identity.email, name: identity.name, submittedAt: identity.submittedAt })).toBe(key);
    expect(key).not.toContain(identity.email); expect(parseInquiryReadKeys([key, key])).toEqual([key]);
    expect(() => parseInquiryReadKeys(["userId=other"])).toThrow(); expect(() => parseInquiryReadKeys(Array(501).fill(key))).toThrow();
  });
});
