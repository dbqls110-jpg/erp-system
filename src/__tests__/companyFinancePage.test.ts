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
  it("합계·상세 내역·월 표시가 같은 필터 자료를 사용한다", async () => {
    mocks.entries.mockResolvedValue([
      { id: "r", company: "인포피아", type: "revenue", amount: 200000, date: "2026-09-01", title: "직접 매출", memo: null },
      { id: "c", company: "인포피아", type: "card", amount: 20000, date: "2026-09-05", title: "카드 사용", memo: null },
    ]);
    mocks.amounts.mockResolvedValue([
      { id: "p1", projectId: "p", kind: "revenue", amount: 51000, label: "견적", memo: null, createdAt: new Date("2026-08-31T15:00:00Z"), project: { name: "테스트 프로젝트", company: "인포피아" } },
      { id: "p2", projectId: "p", kind: "cost", amount: 50000, label: "견적 매입", memo: null, createdAt: new Date("2026-09-02T00:00:00Z"), project: { name: "테스트 프로젝트", company: "인포피아" } },
    ]);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ year: "2026", month: "9", company: "인포피아" }) }));
    expect(mocks.entries.mock.calls[0][0].where).toEqual({ company: "인포피아", date: { gte: "2026-09-01", lt: "2026-10-01" } });
    expect(mocks.amounts.mock.calls[0][0].where).toEqual({ project: { company: "인포피아" }, createdAt: {
      gte: new Date("2026-08-31T15:00:00Z"), lt: new Date("2026-09-30T15:00:00Z"),
    } });
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

  it("연도 이동은 회사·월을 보존하고 허용 연도 범위를 넘지 않는다", () => {
    const html = renderToStaticMarkup(createElement(CompanyFinanceYearNav, { filters: { year: 2000, month: 9, company: "노바웨이" }, currentYear: 2026 }));
    expect(html).not.toContain("1999년 보기");
    expect(html).toContain("2001년 보기");
    expect(html).toContain("month=9");
    expect(html).toContain(`company=${encodeURIComponent("노바웨이")}`);
  });
});
