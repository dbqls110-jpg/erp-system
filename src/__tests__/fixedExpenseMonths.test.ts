import { describe, expect, it } from "vitest";
import {
  fixedExpenseMonthWhere,
  isFixedExpenseActive,
  planFixedExpenseDelete,
  planFixedExpenseUpdate,
  previousMonthKey,
} from "@/lib/fixedExpenseMonths";

describe("고정비 적용 기간", () => {
  it("시작 전·기간 안·끝난 뒤를 구분한다", () => {
    const period = { startMonth: "2026-06", endMonth: "2026-08" };

    expect(isFixedExpenseActive(period, "2026-05")).toBe(false);
    expect(isFixedExpenseActive(period, "2026-07")).toBe(true);
    expect(isFixedExpenseActive(period, "2026-09")).toBe(false);
    expect(fixedExpenseMonthWhere("2026-07")).toEqual({
      startMonth: { lte: "2026-07" },
      OR: [{ endMonth: null }, { endMonth: { gte: "2026-07" } }],
    });
  });

  it("9월 수정은 8월에 옛 행을 끝내고 9월에 새 행을 시작한다", () => {
    expect(planFixedExpenseUpdate({ startMonth: "2026-06", endMonth: null }, "2026-09")).toEqual({
      mode: "split",
      previousEndMonth: "2026-08",
    });
    expect(planFixedExpenseUpdate({ startMonth: "2026-09", endMonth: null }, "2026-09")).toEqual({
      mode: "in-place",
    });
    expect(() => planFixedExpenseUpdate({ startMonth: "2026-09", endMonth: null }, "2026-08"))
      .toThrow("시작되기 전");
  });

  it("1월의 전달은 전년 12월이다", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(planFixedExpenseUpdate({ startMonth: "2025-06", endMonth: null }, "2026-01"))
      .toEqual({ mode: "split", previousEndMonth: "2025-12" });
  });

  it("같은 달 삭제는 삭제하고 뒤 달 삭제는 전달에 끝낸다", () => {
    expect(planFixedExpenseDelete({ startMonth: "2026-09", endMonth: null }, "2026-09"))
      .toEqual({ mode: "delete" });
    expect(planFixedExpenseDelete({ startMonth: "2026-06", endMonth: null }, "2026-09"))
      .toEqual({ mode: "end", previousEndMonth: "2026-08" });
  });
});
