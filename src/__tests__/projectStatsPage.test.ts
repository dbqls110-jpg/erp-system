import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), viewer: vi.fn(), access: vi.fn(), amounts: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/calendarViewer", () => ({ getCalendarViewer: m.viewer }));
vi.mock("@/lib/permissions", () => ({ requireMenuAccess: m.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { projectAmount: { findMany: m.amounts } } }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`redirect:${url}`); } }));
vi.mock("@/app/(app)/projects/stats/RevenueChartsWrapper", () => ({ RevenueCharts: () => null }));
vi.mock("@/lib/dateFormat", async original => ({ ...await original<typeof import("@/lib/dateFormat")>(), currentKoreanDateKey: () => "2026-11-11" }));
import Page from "@/app/(app)/projects/stats/page";

beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue({ user: { id: "staff", role: "member", active: true } });
  m.viewer.mockResolvedValue({ id: "staff", role: "member", partnerId: null, customerId: null });
  m.access.mockResolvedValue(undefined); m.amounts.mockResolvedValue([]);
});

describe("프로젝트 통계 화면", () => {
  it("날짜 미정은 별도 경고하고 원시 차액을 순이익으로 표시하지 않는다", async () => {
    m.amounts.mockResolvedValue([{ kind: "revenue", amount: 2244000, createdAt: new Date("2026-11-11") }]);
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("매출 날짜 미정 1건"); expect(html).toContain("2,244,000원");
    expect(html).toContain("연 매출·매입 차액"); expect(html).not.toContain("연 순이익");
    expect(html).toContain("연 매출"); expect(html).toContain("모든 기간 합계에서 제외");
  });
  it.each([
    { role: "partner", partnerId: null, customerId: null },
    { role: "host", partnerId: null, customerId: null },
    { role: "admin", partnerId: "partner", customerId: null },
    { role: "member", partnerId: null, customerId: "customer" },
  ])("외부 계정은 통계 DB 조회 전 차단한다: $role", async viewer => {
    m.viewer.mockResolvedValue({ id: "external", ...viewer });
    await expect(Page()).rejects.toThrow("redirect:/projects");
    expect(m.amounts).not.toHaveBeenCalled();
  });
  it("권한 거절 시 금액 DB를 읽지 않는다", async () => {
    m.access.mockRejectedValue(Error("forbidden"));
    await expect(Page()).rejects.toThrow("forbidden"); expect(m.amounts).not.toHaveBeenCalled();
  });
  it("비활성 계정은 통계 DB 조회 전 차단한다", async () => {
    m.session.mockResolvedValue({ user: { id: "staff", active: false } });
    await expect(Page()).rejects.toThrow("redirect:/login"); expect(m.amounts).not.toHaveBeenCalled();
  });
});
