import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseProjectFilters } from "@/lib/projectFilters";

vi.mock("next/form", () => ({ default: ({ action, children, ...props }: { action: string; children: ReactNode; prefetch?: boolean; scroll?: boolean }) => {
  const { prefetch, scroll, ...htmlProps } = props;
  void prefetch; void scroll;
  return createElement("form", { ...htmlProps, action, method: "get" }, children);
} }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) }));
import { ProjectSearchFilters } from "@/app/(app)/projects/ProjectSearchFilters";
import { ProjectFilter } from "@/app/(app)/projects/ProjectFilter";

describe("프로젝트 필터 화면", () => {
  const filters = parseProjectFilters({ year: "2026", month: "9", company: "노바웨이", status: "active" }, 2026);
  it("선택된 기간·회사·상태를 조회 폼에 유지하고 기준을 안내한다", () => {
    const html = renderToStaticMarkup(createElement(ProjectSearchFilters, { filters }));
    expect(html).toContain('action="/projects"');
    expect(html).toContain('name="status" value="active"');
    expect(html).toContain('name="year"'); expect(html).toContain('value="2026"');
    expect(html).toContain('value="노바웨이" selected=""');
    expect(html).toContain('value="9" selected=""');
    expect(html).toContain("마감일 기준"); expect(html).toContain("등록일 기준");
    expect(html).toContain("초기화");
  });
  it("외부 화면의 회사 목록은 HTML에도 직렬화하지 않는다", () => {
    const html = renderToStaticMarkup(createElement(ProjectSearchFilters, { filters, showCompany: false }));
    expect(html).not.toContain('name="company"');
    for (const company of ["인포피아", "노바웨이", "클로원"]) expect(html).not.toContain(company);
    expect(html).toContain('name="year"'); expect(html).toContain('name="month"');
  });
  it("상태 탭을 변경해도 회사·기간을 잃지 않고 전체 상태만 해제한다", () => {
    const html = renderToStaticMarkup(createElement(ProjectFilter, { filters }));
    expect(html).toContain("status=completed&amp;company=");
    expect(html).toContain("year=2026&amp;month=9");
    expect(html).toContain('href="/projects?company=');
  });
});
