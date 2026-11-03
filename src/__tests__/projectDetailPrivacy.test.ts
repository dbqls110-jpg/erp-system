import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), viewer: vi.fn(), find: vi.fn(), guard: vi.fn(), edit: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/calendarViewer", () => ({ getCalendarViewer: m.viewer }));
vi.mock("@/lib/permissions", () => ({ requireMenuAccess: m.guard, canEditMenu: m.edit }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: m.find } } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); }, redirect: () => { throw Error("REDIRECT"); } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children) }));
vi.mock("@/app/(app)/projects/[id]/ChecklistPanel", () => ({ ChecklistPanel: () => null }));
vi.mock("@/app/(app)/projects/[id]/ProjectLinksPanel", () => ({ ProjectLinksPanel: () => null }));
vi.mock("@/app/(app)/projects/[id]/ProjectEditButton", () => ({ ProjectEditButton: () => null }));
vi.mock("@/app/(app)/projects/ProjectDeleteButton", () => ({ ProjectDeleteButton: () => null }));
vi.mock("@/app/(app)/projects/[id]/MemoEditor", () => ({ MemoEditor: () => null }));
vi.mock("@/app/(app)/projects/[id]/ProjectFilesPanel", () => ({ ProjectFilesPanel: () => null }));
vi.mock("@/app/(app)/projects/[id]/ProjectAmountsPanel", () => ({ ProjectAmountsPanel: () => null }));
import Page from "@/app/(app)/projects/[id]/page";
import { EXTERNAL_PROJECT_SELECT } from "@/lib/projectVisibility";

const outsider = { id: "external", role: "partner", active: true, partnerId: "partner-1", customerId: null, venueId: null };
const record = { id: "p", name: "외부 공개 행사", status: "active", progress: 25, deadline: "2026-11-07", announceDate: null,
  cost: 987654321, revenue: 876543210, memo: "PRIVATE_MEMO", files: [{ name: "PRIVATE_QUOTE" }], amounts: [{ payments: [{ memo: "PRIVATE_PAYMENT" }] }] };
beforeEach(() => {
  vi.resetAllMocks(); m.session.mockResolvedValue({ user: outsider }); m.viewer.mockResolvedValue(outsider); m.find.mockResolvedValue(record);
});
describe("외부 프로젝트 상세 최소 공개", () => {
  it.each([
    outsider, { ...outsider, role: "admin" }, { ...outsider, role: "member", partnerId: null, customerId: "customer-1" },
  ])("외부 계정은 연결 범위 내 최소 정보만 조회한다: %j", async viewer => {
    m.session.mockResolvedValue({ user: viewer }); m.viewer.mockResolvedValue(viewer);
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "p" }) }));
    expect(m.find).toHaveBeenCalledOnce();
    const query = m.find.mock.calls[0][0];
    expect(query.select).toEqual(EXTERNAL_PROJECT_SELECT); expect(query.include).toBeUndefined();
    expect(query.where.AND).not.toEqual([{}]); expect(m.edit).not.toHaveBeenCalled();
    expect(html).toContain("외부 공개 행사"); expect(html).toContain("25%"); expect(html).toContain("2026-11-07");
    for (const value of ["PRIVATE_", "987654321", "876543210", "지급", "매출", "매입", "메모", "파일"]) expect(html).not.toContain(value);
  });
  it("연결되지 않은 프로젝트는 404이며 내부 조회로 재시도하지 않는다", async () => {
    m.find.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: "unlinked" }) })).rejects.toThrow("NOT_FOUND");
    expect(m.find).toHaveBeenCalledOnce();
  });
  it("미로그인 또는 비활성이면 DB를 조회하지 않는다", async () => {
    m.session.mockResolvedValue(null); m.viewer.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: "p" }) })).rejects.toThrow("REDIRECT");
    m.session.mockResolvedValue({ user: { ...outsider, active: false } }); m.viewer.mockResolvedValue(outsider);
    await expect(Page({ params: Promise.resolve({ id: "p" }) })).rejects.toThrow("REDIRECT");
    expect(m.find).not.toHaveBeenCalled();
  });
});
