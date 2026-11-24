import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";
import { getProjectQuoteKind } from "@/lib/quotePolicy";
import { analyzeQuoteFile } from "@/lib/quoteParser";

function workbook(name: string, rows: Array<Array<string | number>>) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "견적서");
  const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
  return new File([bytes], name);
}

describe("매출·매입 견적서", () => {
  it("파일명으로 구분하고 모호한 구분은 추측하지 않는다", () => {
    expect(getProjectQuoteKind("매출 견적서.xlsx")).toBe("revenue");
    expect(getProjectQuoteKind("매입 견적서 내부용.pdf")).toBe("cost");
    expect(getProjectQuoteKind("매출 매입 견적서.xlsx")).toBeNull();
    expect(getProjectQuoteKind("매출 매입 견적서 내부용.xlsx")).toBe("internal");
    expect(getProjectQuoteKind("공연 견적서.pdf")).toBeNull();
  });

  it("공급가와 품목을 중복 합산하지 않고 매입에 부가세 포함 합계만 반영한다", async () => {
    const result = await analyzeQuoteFile(workbook("장비 매입.xlsx", [
      ["번호", "품명", "수량", "단가", "금액"],
      [1, "의자", 2, 60_000, 120_000],
      [2, "운반", 1, 80_000, 80_000],
      ["공급가액", 200_000], ["부가세 포함", 220_000],
    ]));
    expect(result).toMatchObject({ revenue: null, cost: 220_000, confidence: "high", items: [
      { name: "의자", quantity: 2, unitPrice: 60_000, amount: 120_000 },
      { name: "운반", quantity: 1, unitPrice: 80_000, amount: 80_000 },
    ] });
  });

  it("매출 파일의 합계만 매출로 가져온다", async () => {
    const result = await analyzeQuoteFile(workbook("매출.xlsx", [["합계", 1_000_000]]));
    expect(result).toMatchObject({ revenue: 1_000_000, cost: null });
  });

  it("단가나 다른 행의 연락처를 합계로 오인하지 않는다", async () => {
    const result = await analyzeQuoteFile(workbook("매입.xlsx", [
      ["품명", "수량", "단가", "금액"], ["의자", 2, 10_000, 20_000],
      ["총액"], ["연락처", "010-0000-0000"],
    ]));
    expect(result).toMatchObject({ revenue: null, cost: null, confidence: "none" });
  });

  it.skipIf(!process.env.ERP_QUOTE_PDF_FIXTURE)("첨부된 매입 PDF에서 배송비와 줄바꿈된 품목까지 읽는다", async () => {
    const bytes = await readFile(process.env.ERP_QUOTE_PDF_FIXTURE!);
    const result = await analyzeQuoteFile(new File([new Uint8Array(bytes)], "매입 견적서.pdf", { type: "application/pdf" }));
    expect(result.cost).toBe(2_937_000);
    expect(result.revenue).toBeNull();
    expect(result.items).toHaveLength(10);
    expect(result.items?.reduce((sum, item) => sum + item.amount, 0)).toBe(2_670_000);
    expect(result.items?.[7]).toMatchObject({ name: "삼성 무빙스타일 스마트모니터 32인치tv", quantity: 6, unitPrice: 100_000 });
    expect(result.items?.[9]).toEqual({ name: "왕복 배송비", quantity: 2, unitPrice: 160_000, amount: 320_000 });
  });
});
