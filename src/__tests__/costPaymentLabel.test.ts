import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/projectCostPayment", () => ({
  saveProjectCostPayment: vi.fn(), deleteProjectCostPayment: vi.fn(),
  setProjectCostSettled: vi.fn(), payProjectCostToday: vi.fn(),
}));
import { CostPayments } from "@/components/projects/CostPayments";

describe("프로젝트 매입 지급 체크 명칭", () => {
  it.each([false, true])("정산 상태가 %s여도 지급 완료로 표시한다", costSettled => {
    const html = renderToStaticMarkup(createElement(CostPayments, {
      projectId: "p", canManage: true,
      item: { id: "cost-1", label: "디자인비", amount: 330000, costSettled, payments: [] },
    }));
    expect(html).toContain("지급 완료</label>");
    expect(html).not.toContain("오늘 지급 완료");
    expect(html.includes('checked=""')).toBe(costSettled);
  });
  it("지급 관리 권한이 없으면 체크 컨트롤을 표시하지 않는다", () => {
    const html = renderToStaticMarkup(createElement(CostPayments, {
      projectId: "p", canManage: false,
      item: { id: "cost-1", label: "디자인비", amount: 330000, payments: [] },
    }));
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("지급 기록 / 정산");
  });
});
