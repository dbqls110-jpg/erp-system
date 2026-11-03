import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), access: vi.fn(), edit: vi.fn(), entries: vi.fn(), amounts: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({ requireMenuAccess: mocks.access, canEditMenu: mocks.edit }));
vi.mock("@/lib/prisma", () => ({ prisma: { companyFinanceEntry: { findMany: mocks.entries }, projectAmount: { findMany: mocks.amounts } } }));
vi.mock("@/lib/dateFormat", async (original) => ({ ...await original<typeof import("@/lib/dateFormat")>(), currentKoreanDateKey: () => "2026-10-23" }));
vi.mock("@/app/(app)/company-finance/CompanyFinanceEntryForm", () => ({ CompanyFinanceEntryForm: () => null }));
vi.mock("@/app/(app)/company-finance/CompanyFinanceEntryDeleteButton", () => ({ CompanyFinanceEntryDeleteButton: () => null }));
vi.mock("@/components/RevenueDatesButton", () => ({ RevenueDatesButton: () => createElement("button", null, "날짜 수정") }));
vi.mock("next/form", () => ({ default: ({ children, action, className, ...props }: ComponentProps<"form"> & { prefetch?: boolean; scroll?: boolean }) =>
  createElement("form", { action, className, "aria-label": props["aria-label"] }, children),
}));

import Page from "@/app/(app)/company-finance/page";
import { CompanyFinanceYearNav } from "@/app/(app)/company-finance/CompanyFinanceYearNav";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "finance-reader", role: "staff" } });
  mocks.access.mockResolvedValue(undefined);
  mocks.edit.mockResolvedValue(false);
  mocks.entries.mockResolvedValue([]);
  mocks.amounts.mockResolvedValue([]);
});

describe("회사 재무 필터 페이지", () => {
  it.each([
    ["dbqls110@gmail.com", "admin", true, 2],
    ["other@example.com", "admin", true, 0],
    ["qkrtjrdud952@gmail.com", "manager", true, 0],
    ["dbqls110@gmail.com", "admin", false, 0],
  ])("메뉴 수정 권한이 있어도 본인 계정만 날짜 수정 버튼을 본다: %s", async (email, role, active, count) => {
    mocks.session.mockResolvedValue({ user: { id: "user-1", email, role, active } });
    mocks.edit.mockResolvedValue(true);
    mocks.entries.mockResolvedValue([{ id: "entry-1", company: "인포피아", type: "revenue", amount: 1000, date: "2026-10-01", title: "직접 매출", memo: null }]);
    mocks.amounts.mockResolvedValue([{ id: "amount-1", projectId: "p1", kind: "revenue", amount: 2000, createdAt: new Date("2026-10-01"), project: { name: "날짜 미정 프로젝트", company: "인포피아" } }]);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ year: "2026" }) }));
    expect(html.match(/날짜 수정<\/button>/g) ?? []).toHaveLength(count);
  });
  it("합계·상세 내역·월 표시가 같은 필터 자료를 사용한다", async () => {
    mocks.entries.mockResolvedValue([
      { id: "r", company: "인포피아", type: "revenue", amount: 200000, date: "2026-09-01", title: "직접 매출", memo: null },
      { id: "c", company: "인포피아", type: "card", amount: 20000, date: "2026-09-05", title: "카드 사용", memo: null },
    ]);
    mocks.amounts.mockResolvedValue([
      { id: "p1", projectId: "p", kind: "revenue", amount: 51000, label: "견적", memo: null, invoiceDate: "2026-09-01", createdAt: new Date("2026-08-31T15:00:00Z"), project: { name: "테스트 프로젝트", company: "인포피아" } },
      { id: "p2", projectId: "p", kind: "cost", amount: 50000, label: "견적 매입", memo: null, createdAt: new Date("2026-09-02T00:00:00Z"), project: { name: "테스트 프로젝트", company: "인포피아" } },
    ]);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ year: "2026", month: "9", company: "인포피아" }) }));
    expect(mocks.entries.mock.calls[0][0].where).toMatchObject({ company: "인포피아", OR: expect.any(Array) });
    expect(mocks.amounts.mock.calls[0][0].where).toMatchObject({ project: { company: "인포피아" }, OR: expect.any(Array) });
    expect(html).toContain("인포피아 · 2026년 9월 · 4건");
    for (const value of ["251,000원", "50,000원", "20,000원", "181,000원", "9월 합계", "2026-09-01"]) expect(html).toContain(value);
    expect(html).not.toContain("1분기");
    expect(html).not.toContain("연간 합계");
    expect(html).toContain('value="인포피아" selected=""');
    expect(html).toContain('value="9" selected=""');
    expect(html).toContain("조회 날짜 기준");
  });

  it("기본 조회는 전체 회사·연간이고 빈 결과와 0원도 정상 표시한다", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("전체 회사 · 2026년 전체 월 · 0건");
    expect(html).toContain("선택한 회사·기간에 등록된 내역이 없습니다.");
    expect(html).toContain("0원");
    expect(html).toContain("1분기");
    expect(html).toContain("4분기");
    expect(mocks.amounts.mock.calls[0][0].where.project).toBeUndefined();
  });

  it("권한이 없으면 장부 DB를 조회하지 않는다", async () => {
    mocks.access.mockRejectedValueOnce(new Error("forbidden"));
    await expect(Page({ searchParams: Promise.resolve({ company: "인포피아", month: "10" }) })).rejects.toThrow("forbidden");
    expect(mocks.entries).not.toHaveBeenCalled();
    expect(mocks.amounts).not.toHaveBeenCalled();
  });

  it("등록월이 아니라 실제 입금월에만 매출을 포함한다", async () => {
    mocks.amounts.mockResolvedValue([{ id: "r1", projectId: "p", kind: "revenue", amount: 1000, label: "매출", memo: null,
      createdAt: new Date("2026-09-01T00:00:00Z"), expectedPaymentDate: "2026-10-20", invoiceDate: "2026-10-30", paidDate: "2026-11-02", project: { name: "이동 확인", company: "인포피아" } }]);
    const october = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ year: "2026", month: "10" }) }));
    const november = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ year: "2026", month: "11" }) }));
    expect(october).toContain("2026년 10월 · 0건"); expect(october).not.toContain("이동 확인");
    expect(november).toContain("2026년 11월 · 1건"); expect(november).toContain("실제 입금일 · 2026-11-02");
    expect(november.replace(/<[^>]+>/g, "").replace(/\s+/g, "")).toContain("조회매출합계1,000원");
  });

  it("날짜 없는 프로젝트 매출은 별도 목록에 남기되 기간 합계에서 제외한다", async () => {
    mocks.amounts.mockResolvedValue([{ id: "r1", projectId: "p", kind: "revenue", amount: 1000, label: "매출", memo: null,
      createdAt: new Date("2026-10-01T00:00:00Z"), paidDate: null, invoiceDate: null, expectedPaymentDate: null, project: { name: "날짜 없는 매출", company: "인포피아" } }]);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ year: "2026", month: "10" }) }));
    expect(html).toContain("매출 날짜 미정"); expect(html).toContain("날짜 없는 매출"); expect(html).toContain("2026년 10월 · 0건");
    expect(html.replace(/<[^>]+>/g, "").replace(/\s+/g, "")).toContain("조회매출합계0원");
  });

  it("연도 이동은 회사·월을 보존하고 허용 연도 범위를 넘지 않는다", () => {
    const html = renderToStaticMarkup(createElement(CompanyFinanceYearNav, { filters: { year: 2000, month: 9, company: "노바웨이" }, currentYear: 2026 }));
    expect(html).not.toContain("1999년 보기");
    expect(html).toContain("2001년 보기");
    expect(html).toContain("month=9");
    expect(html).toContain(`company=${encodeURIComponent("노바웨이")}`);
  });
});
