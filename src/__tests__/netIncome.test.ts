import { describe, expect, it } from "vitest";
import { calculateNetIncome, calculateOperatingProfit, NET_INCOME_RATE } from "@/lib/financeMetrics";

describe("당기순이익", () => {
  it("영업이익에서 19%를 차감하고 원 미만은 버린다", () => {
    expect(NET_INCOME_RATE).toBe(0.81);
    expect(calculateOperatingProfit(2_240_750, 1_626_900)).toBe(613_850);
    expect(calculateNetIncome(2_240_750, 1_626_900)).toBe(497_218);
    expect(calculateNetIncome(2_244_000, 1_384_328)).toBe(696_334);
  });

  it("매출 또는 매입이 null이면 계산하지 않는다", () => {
    expect(calculateNetIncome(null, 1_626_900)).toBeNull();
    expect(calculateNetIncome(2_240_750, null)).toBeNull();
  });
});
