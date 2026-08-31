import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeQuoteFile, parseQuoteText } from "@/lib/quoteParser";

describe("견적서 금액 추출", () => {
  it("매출·매입 라벨과 원 단위 금액을 읽는다", () => {
    const result = parseQuoteText("매출금액: 1,200,000원\n매입금액: 700,000원");

    expect(result.revenue).toBe(1_200_000);
    expect(result.cost).toBe(700_000);
    expect(result.confidence).toBe("high");
    expect(result.matchedLabels).toEqual(expect.arrayContaining(["매출금액", "매입금액"]));
  });

  it("만원·천원 단위를 원으로 환산한다", () => {
    const result = parseQuoteText("견적금액 125만원\n제작비 30만원");

    expect(result.revenue).toBe(1_250_000);
    expect(result.cost).toBe(300_000);
  });

  it("총 견적 금액처럼 라벨 중간에 공백이 있어도 읽는다", () => {
    const result = parseQuoteText("총 견적 금액: 2,500,000원");

    expect(result.revenue).toBe(2_500_000);
  });

  it("합계만 있으면 매출로 임시 입력하고 매입을 추측하지 않는다", () => {
    const result = parseQuoteText("총 합계: 3,000,000원");

    expect(result.revenue).toBe(3_000_000);
    expect(result.cost).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.note).toContain("임시 입력");
  });

  it("금액 라벨이 없으면 값을 만들어내지 않는다", () => {
    const result = parseQuoteText("행사일: 2026-08-28\n담당자: 010-1234-5678");

    expect(result.revenue).toBeNull();
    expect(result.cost).toBeNull();
    expect(result.confidence).toBe("none");
  });

  it("엑셀 견적서에서도 매출·매입 금액을 읽는다", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["매출 금액", "매입 금액"],
      ["1,200,000원", "700,000원"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "견적서");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const result = await analyzeQuoteFile(new File([bytes], "견적서.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));

    expect(result.source).toBe("spreadsheet");
    expect(result.revenue).toBe(1_200_000);
    expect(result.cost).toBe(700_000);
  });

  it.each([
    ["총액 1억원", 100_000_000],
    ["총액 3,000만원", 30_000_000],
    ["총액 1억 2,000만원", 120_000_000],
    ["총액 2억 5,000만원", 250_000_000],
    ["총액 1억2천만원", 120_000_000],
  ])("억·만 표기 %s를 정확히 읽는다", (text, expected) => {
    expect(parseQuoteText(text).revenue).toBe(expected);
  });

  it("억 뒤에 만 금액이 없으면 억만 읽는다", () => {
    expect(parseQuoteText("총액 1억").revenue).toBe(100_000_000);
  });

  it("억 없이 만원 금액을 읽는다", () => {
    expect(parseQuoteText("총액 2,000만원").revenue).toBe(20_000_000);
  });

  it("단위 없는 원 금액은 기존처럼 읽는다", () => {
    expect(parseQuoteText("총액 5,500,000원").revenue).toBe(5_500_000);
  });

  it("억과 만 사이의 줄바꿈을 허용한다", () => {
    expect(parseQuoteText("총액 1억 2천만 원").revenue).toBe(120_000_000);
    expect(parseQuoteText("총액 1억\n2천만 원").revenue).toBe(120_000_000);
  });

  it("천·백으로 이어진 만원 금액을 단위별로 계산한다", () => {
    expect(parseQuoteText("총액 3천5백만원").revenue).toBe(35_000_000);
  });
});
