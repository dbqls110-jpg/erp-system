import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  viewer: { id: "external", role: "partner", partnerId: "partner-1" as string | null, customerId: null },
  one: vi.fn(), many: vi.fn(), guard: vi.fn(), edit: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: m.viewer }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/calendarViewer", () => ({ getCalendarViewer: async () => m.viewer }));
vi.mock("@/lib/permissions", () => ({ requireMenuAccess: m.guard, canEditMenu: m.edit }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: m.one, findMany: m.many } } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); }, redirect: () => { throw Error("REDIRECT"); } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children) }));
vi.mock("@/app/(app)/projects/ProjectFilter", () => ({ ProjectFilter: () => null }));
vi.mock("@/app/(app)/projects/ProjectSearchFilters", () => ({ ProjectSearchFilters: () => null }));
import List from "@/app/(app)/projects/page";
import { EXTERNAL_PROJECT_SELECT } from "@/lib/projectVisibility";

const record = {
  id: "project-1", name: "공개 프로젝트", status: "completed", progress: 0, deadline: "2026-11-21", announceDate: null,
  revenue: 999999999, cost: 888888888, memo: "PRIVATE_MEMO", client: "PRIVATE_CLIENT", company: "PRIVATE_COMPANY",
  files: [{ name: "PRIVATE_QUOTE", url: "https://example.test/private" }],
};
beforeEach(() => {
  vi.clearAllMocks(); m.viewer.partnerId = "partner-1"; m.viewer.role = "partner";
  m.one.mockResolvedValue(record); m.many.mockResolvedValue([record]);
});
function expectSafeQuery(query: { select: unknown; include?: unknown; where: unknown }) {
  expect(query.select).toEqual(EXTERNAL_PROJECT_SELECT);
  expect(query.include).toBeUndefined();
  expect(query.where).toMatchObject({ AND: expect.arrayContaining([{ OR: [{ partners: { some: { partnerId: "partner-1" } } }] }]) });
}
function expectSafeHtml(html: string) {
  expect(html).toContain("공개 프로젝트"); expect(html).toContain("100%"); expect(html).toContain("2026-11-21");
  for (const secret of ["PRIVATE_", "999999999", "888888888", "example.test/private", "매출", "매입", "견적서", "메모"]) expect(html).not.toContain(secret);
}
describe("외부 프로젝트 최소 공개 정책", () => {
  it("목록에도 내부 회사·거래처·담당자·금액을 전달하지 않는다", async () => {
    expectSafeHtml(renderToStaticMarkup(await List({ searchParams: Promise.resolve({}) })));
    expectSafeQuery(m.many.mock.calls[0][0]); expect(m.edit).not.toHaveBeenCalled();
  });
  it("기간·상태 필터를 조합해도 외부 연결 범위를 유지하고 회사 검색값은 무시한다", async () => {
    const html = renderToStaticMarkup(await List({ searchParams: Promise.resolve({ year: "2026", month: "11", company: "인포피아", status: "completed" }) }));
    expectSafeHtml(html);
    const query = m.many.mock.calls[0][0];
    expectSafeQuery(query);
    expect(query.where.AND[1]).toMatchObject({ AND: [{ status: "completed" }, { OR: [{ deadline: { gte: "2026-11-01", lt: "2026-12-01" } }, expect.anything()] }] });
    expect(JSON.stringify(query.where)).not.toContain("company");
  });
  it("내부 직원 목록에는 회사·기간·상태 조건을 하나의 조회에 모두 적용한다", async () => {
    m.viewer.role = "admin"; m.viewer.partnerId = null; m.edit.mockResolvedValue(false);
    const html = renderToStaticMarkup(await List({ searchParams: Promise.resolve({ year: "2025", month: "12", company: "클로원", status: "active" }) }));
    expect(m.guard).toHaveBeenCalledWith("external", "projects", "admin");
    expect(m.many).toHaveBeenCalledTimes(1);
    expect(m.many.mock.calls[0][0].where).toMatchObject({ AND: [{}, { AND: [
      { status: "active" }, { company: "클로원" }, { OR: [{ deadline: { gte: "2025-12-01", lt: "2026-01-01" } }, expect.anything()] },
    ] }] });
    expect(html).toContain("조회 결과 1개");
  });
});
