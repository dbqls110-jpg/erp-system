import { describe, expect, it } from "vitest";
import { isInternalQuoteFileName } from "@/lib/quotePolicy";

describe("견적서 금액 반영 파일명 정책", () => {
  it("내부용이 포함된 파일만 금액 분석 대상으로 판정한다", () => {
    expect(isInternalQuoteFileName("1144 (인천교육청) 견적서 내부용.xlsx")).toBe(true);
    expect(isInternalQuoteFileName("1144 (인천교육청) 견적서.xlsx")).toBe(false);
  });
});
