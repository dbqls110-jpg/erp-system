import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeQuoteFile } from "@/lib/quoteParser";

function workbookFile(sheets: Array<{ name: string; rows: unknown[][] }>, fileName = "견적서 내부용.xlsx") {
  const workbook = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("엑셀 견적서 행 단위 금액 분석", () => {
  it("총계·TOTAL이 있어도 특수 라벨의 매출·매입을 우선한다", async () => {
    const file = workbookFile([
      {
        name: "첫 시트",
        rows: [
          ["", "총계", "", "", 2_522_727],
          ["", "TOTAL", "", "", 2_775_000],
          ["", "널위문 분배 후 잔액", "", "", 2_240_750, "", "", "", 2_240_750],
          ["", "실 사용금액", "", "", "₩1,626,900"],
          ["", "당기순이익 (영업이익 -21%)", "", "", "₩484,941"],
        ],
      },
      {
        name: "다른 시트",
        rows: [["널위문 분배 후 잔액", 999_999], ["실사용금액", 888_888]],
      },
    ]);

    const result = await analyzeQuoteFile(file);

    expect(result.source).toBe("spreadsheet");
    expect(result.revenue).toBe(2_240_750);
    expect(result.cost).toBe(1_626_900);
    expect(result.confidence).toBe("high");
  });

  it("같은 행에서 오른쪽 첫 숫자 셀을 사용하고 공백·통화기호를 허용한다", async () => {
    const file = workbookFile([
      {
        name: "견적",
        rows: [
          ["널위문 분배 후 잔액", "설명", "₩2,240,750", "₩9,999,999"],
          ["실 사용금액", "₩484,941"],
        ],
      },
    ]);

    const result = await analyzeQuoteFile(file);

    expect(result.revenue).toBe(2_240_750);
    expect(result.cost).toBe(484_941);
  });
});
