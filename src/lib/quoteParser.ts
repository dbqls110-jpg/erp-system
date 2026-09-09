import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

/** 금액 추출 결과의 신뢰도. 자동 입력 후에도 사용자가 확인할 수 있게 화면에 표시한다. */
export type QuoteConfidence = "high" | "medium" | "low" | "none";

export interface QuoteAnalysis {
  revenue: number | null;
  cost: number | null;
  confidence: QuoteConfidence;
  source: "pdf-text" | "text" | "spreadsheet" | "unsupported" | "empty";
  note: string;
  matchedLabels: string[];
}

const MAX_PARSE_BYTES = 10 * 1024 * 1024;

const REVENUE_LABELS = [
  String.raw`총\s*견적\s*(?:금액|가)?`,
  "계약금액",
  "견적(?:금액|가)?",
  "청구(?:금액|액)?",
  String.raw`총\s*합계(?:금액|액)`,
  "합계금액",
  "공급가액",
  "판매(?:금액|가)?",
  "매출(?:금액|액)?",
];

const COST_LABELS = [
  "매입(?:금액|액)?",
  "원가(?:금액)?",
  "외주비",
  "제작비",
  "비용(?:금액)?",
];

const GENERIC_TOTAL_LABELS = [String.raw`총\s*액`, "합계(?:금액|액)?"];

type MoneyCandidate = {
  value: number;
  label: string;
  distance: number;
};

const ARABIC_NUMBER_PATTERN = String.raw`(?:[0-9]{1,3}(?:[,\s][0-9]{3})+|[0-9]+(?:\.[0-9]+)?)`;
const KOREAN_NUMBER_PATTERN = String.raw`[0-9]+(?:\s*(?:십|백|천)\s*[0-9]*)+`;
const AMOUNT_NUMBER_PATTERN = String.raw`(?:${ARABIC_NUMBER_PATTERN}|${KOREAN_NUMBER_PATTERN})`;

function numberPattern(): RegExp {
  // 억과 만이 함께 있는 표현을 한 후보로 잡아 두 단위의 금액을 합산할 수 있게 한다.
  return new RegExp(
    String.raw`(?:₩|￦|\$)?\s*((?:${ARABIC_NUMBER_PATTERN}\s*억(?:\s*${AMOUNT_NUMBER_PATTERN}\s*만(?:\s*원)?|\s*원)?)|(?:${AMOUNT_NUMBER_PATTERN}\s*만(?:\s*원)?)|(?:${ARABIC_NUMBER_PATTERN}\s*(?:천만|백만|만원|천원|만|천|백|십|원)?))(?![0-9십백천])`,
    "giu",
  );
}

function parseAmountNumber(raw: string): number | null {
  const normalized = raw.replace(/[\s,]/g, "");
  if (/^[0-9]+(?:\.[0-9]+)?$/u.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  if (!/^[0-9]+(?:(?:십|백|천)[0-9]*)+$/u.test(normalized)) return null;

  let total = 0;
  let current = 0;
  for (const character of normalized) {
    if (/^[0-9]$/u.test(character)) {
      current = current * 10 + Number(character);
      continue;
    }

    const multiplier = character === "천" ? 1_000 : character === "백" ? 100 : 10;
    const value = (current || 1) * multiplier;
    if (!Number.isSafeInteger(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
    current = 0;
  }

  const result = total + current;
  return Number.isSafeInteger(result) ? result : null;
}

function moneyForUnit(raw: string, unit: string): number | null {
  const numeric = parseAmountNumber(raw);
  if (numeric === null) return null;

  const multiplier = unit.toLowerCase() === "억"
    ? 100_000_000
    : unit === "천만"
      ? 10_000_000
      : unit === "백만"
        ? 1_000_000
        : unit === "만원" || unit === "만"
          ? 10_000
          : unit === "천원" || unit === "천"
            ? 1_000
            : unit === "백"
              ? 100
              : unit === "십"
                ? 10
                : 1;
  const result = Math.round(numeric * multiplier);
  return Number.isSafeInteger(result) ? result : null;
}

function sumMoneyValues(values: Array<number | null>): number | null {
  let result = 0;
  for (const value of values) {
    if (value === null) return null;
    result += value;
    if (!Number.isSafeInteger(result)) return null;
  }
  return result;
}

function toMoney(raw: string, unit?: string): number | null {
  const normalized = raw
    .replace(/[₩￦$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (unit) return moneyForUnit(normalized, unit);

  const eokMatch = normalized.match(/^(.+?)\s*억(?:\s*(.+?)\s*만)?\s*원?$/u);
  if (eokMatch) {
    return sumMoneyValues([
      moneyForUnit(eokMatch[1], "억"),
      ...(eokMatch[2] === undefined ? [] : [moneyForUnit(eokMatch[2], "만")]),
    ]);
  }

  const manMatch = normalized.match(/^(.+?)\s*만\s*원?$/u);
  if (manMatch) return moneyForUnit(manMatch[1], "만");

  const simpleMatch = normalized.match(/^(.+?)\s*(천만|백만|만원|천원|만|천|백|십|원)$/u);
  if (simpleMatch) return moneyForUnit(simpleMatch[1], simpleMatch[2]);

  return moneyForUnit(normalized, "");
}

function extractMoneyCandidates(text: string, labelExpressions: string[]): MoneyCandidate[] {
  const candidates: MoneyCandidate[] = [];

  for (const labelExpression of labelExpressions) {
    const labelRegex = new RegExp(labelExpression, "giu");
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = labelRegex.exec(text)) !== null) {
      // 대부분의 견적서는 라벨 뒤에 금액이 오지만, 표를 복사하면 금액이 앞에 올 수도
      // 있어 양쪽을 함께 본다. 80자는 다른 행의 금액을 섞지 않으면서 줄바꿈도 포함한다.
      const start = Math.max(0, labelMatch.index - 80);
      const end = Math.min(text.length, labelMatch.index + labelMatch[0].length + 100);
      const window = text.slice(start, end);
      const relativeLabelIndex = labelMatch.index - start;
      const moneyRegex = numberPattern();
      let moneyMatch: RegExpExecArray | null;
      while ((moneyMatch = moneyRegex.exec(window)) !== null) {
        const value = toMoney(moneyMatch[1]);
        if (value === null) continue;
        const moneyIndex = start + moneyMatch.index;
        const distance = Math.abs(moneyIndex - labelMatch.index);
        // 숫자가 라벨에서 너무 멀면 다음 표 행의 값일 가능성이 높다.
        if (distance > 100) continue;
        candidates.push({ value, label: labelMatch[0], distance: Math.abs(moneyMatch.index - relativeLabelIndex) });
      }
    }
  }

  return candidates.sort((a, b) => a.distance - b.distance);
}

function uniqueLabels(candidates: MoneyCandidate[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.label.trim()))];
}

function formatMoney(value: number | null): string {
  return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}원`;
}

/** 텍스트가 이미 추출된 견적서에서 매출·매입 금액을 찾는다. */
export function parseQuoteText(text: string, source: "pdf-text" | "text" | "spreadsheet" = "text"): QuoteAnalysis {
  const normalized = text.normalize("NFKC").replace(/\u00a0/g, " ").trim();
  if (!normalized) {
    return {
      revenue: null,
      cost: null,
      confidence: "none",
      source: "empty",
      note: "견적서에서 읽을 수 있는 텍스트가 없습니다. 금액을 직접 확인해 주세요.",
      matchedLabels: [],
    };
  }

  const revenueCandidates = extractMoneyCandidates(normalized, REVENUE_LABELS);
  const costCandidates = extractMoneyCandidates(normalized, COST_LABELS);
  const genericCandidates = extractMoneyCandidates(normalized, GENERIC_TOTAL_LABELS);
  const revenueCandidate = revenueCandidates[0] ?? genericCandidates[0];
  const costCandidate = costCandidates[0];
  const matchedLabels = uniqueLabels([...revenueCandidates, ...costCandidates, ...(revenueCandidates.length ? [] : genericCandidates)]);

  if (!revenueCandidate && !costCandidate) {
    return {
      revenue: null,
      cost: null,
      confidence: "none",
      source,
      note: "견적서에서 매출·매입으로 볼 수 있는 금액을 찾지 못했습니다. 금액을 직접 입력해 주세요.",
      matchedLabels,
    };
  }

  const usedGenericTotal = !revenueCandidates.length && Boolean(genericCandidates.length);
  const confidence: QuoteConfidence = costCandidate && revenueCandidates.length > 0
    ? "high"
    : usedGenericTotal
      ? "low"
      : "medium";
  const note = [
    `매출 ${formatMoney(revenueCandidate?.value ?? null)}`,
    `매입 ${formatMoney(costCandidate?.value ?? null)}`,
    usedGenericTotal ? "총액·합계만 확인되어 매출로 임시 입력했습니다." : "저장 전 금액을 확인해 주세요.",
  ].join(" / ");

  return {
    revenue: revenueCandidate?.value ?? null,
    cost: costCandidate?.value ?? null,
    confidence,
    source,
    note,
    matchedLabels,
  };
}

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("text/") || [".txt", ".csv", ".json"].some((extension) => name.endsWith(extension));
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return [".xls", ".xlsx"].some((extension) => name.endsWith(extension))
    || file.type === "application/vnd.ms-excel"
    || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

const SPREADSHEET_PRIORITY_LABELS = {
  revenue: "널위문 분배 후 잔액",
  cost: "실사용금액",
} as const;

type SpreadsheetPriorityValues = {
  revenue: number | null;
  cost: number | null;
  matchedLabels: string[];
  found: boolean;
};

function spreadsheetCellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  const value = cell.w ?? cell.v;
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeSpreadsheetLabel(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function parseSpreadsheetAmount(cell: XLSX.CellObject | undefined): number | null {
  if (!cell) return null;

  if (typeof cell.v === "number") {
    return Number.isFinite(cell.v) && cell.v >= 0 ? Math.round(cell.v) : null;
  }

  const normalized = spreadsheetCellText(cell)
    .normalize("NFKC")
    .replace(/[₩￦$]/gu, "")
    .replace(/,/gu, "")
    .replace(/\s+/gu, "")
    .replace(/원$/u, "");
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function sheetRows(sheet: XLSX.WorkSheet): XLSX.CellObject[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  return Array.from({ length: range.e.r - range.s.r + 1 }, (_, rowOffset) =>
    Array.from({ length: range.e.c - range.s.c + 1 }, (_, columnOffset) =>
      sheet[XLSX.utils.encode_cell({ r: range.s.r + rowOffset, c: range.s.c + columnOffset })],
    ),
  );
}

function firstAmountToRight(row: XLSX.CellObject[], labelIndex: number): number | null {
  for (let index = labelIndex + 1; index < row.length; index += 1) {
    const amount = parseSpreadsheetAmount(row[index]);
    if (amount !== null) return amount;
  }
  return null;
}

function findPriorityValuesInSheet(sheet: XLSX.WorkSheet): SpreadsheetPriorityValues {
  const values: SpreadsheetPriorityValues = {
    revenue: null,
    cost: null,
    matchedLabels: [],
    found: false,
  };
  const normalizedLabels = new Map<string, keyof typeof SPREADSHEET_PRIORITY_LABELS>([
    [normalizeSpreadsheetLabel(SPREADSHEET_PRIORITY_LABELS.revenue), "revenue"],
    [normalizeSpreadsheetLabel(SPREADSHEET_PRIORITY_LABELS.cost), "cost"],
  ]);

  for (const row of sheetRows(sheet)) {
    for (let index = 0; index < row.length; index += 1) {
      const cell = row[index];
      const kind = normalizedLabels.get(normalizeSpreadsheetLabel(spreadsheetCellText(cell)));
      if (!kind) continue;

      values.found = true;
      values.matchedLabels.push(spreadsheetCellText(cell));
      if (values[kind] === null) values[kind] = firstAmountToRight(row, index);
    }
  }

  return values;
}

function firstAmountForLegacyCell(rows: XLSX.CellObject[][], rowIndex: number, columnIndex: number): number | null {
  const rowAmount = firstAmountToRight(rows[rowIndex], columnIndex);
  if (rowAmount !== null) return rowAmount;

  // 기존에 지원하던 간단한 2행 표(첫 행 라벨, 다음 행 같은 열 금액)는
  // 우선순위 라벨이 없는 오래된 파일에서만 보존한다.
  for (let nextRow = rowIndex + 1; nextRow < rows.length; nextRow += 1) {
    const amount = parseSpreadsheetAmount(rows[nextRow][columnIndex]);
    if (amount !== null) return amount;
  }
  return null;
}

function extractSpreadsheetCandidates(
  workbook: XLSX.WorkBook,
  labelExpressions: string[],
): MoneyCandidate[] {
  const candidates: MoneyCandidate[] = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[sheetName]);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        const label = spreadsheetCellText(row[columnIndex]);
        if (!label) continue;
        const matchedExpression = labelExpressions.find((expression) => new RegExp(expression, "iu").test(label));
        if (!matchedExpression) continue;
        const value = firstAmountForLegacyCell(rows, rowIndex, columnIndex);
        if (value !== null) candidates.push({ value, label, distance: columnIndex });
      }
    }
  }
  return candidates;
}

function parseSpreadsheetWorkbook(workbook: XLSX.WorkBook): QuoteAnalysis {
  // 특수 라벨은 라벨을 발견한 첫 시트만 사용한다. 이후 시트의 총계가
  // 먼저 걸려 매출을 덮어쓰는 일을 막는다.
  for (const sheetName of workbook.SheetNames) {
    const priority = findPriorityValuesInSheet(workbook.Sheets[sheetName]);
    if (!priority.found) continue;

    const hasBoth = priority.revenue !== null && priority.cost !== null;
    return {
      revenue: priority.revenue,
      cost: priority.cost,
      confidence: hasBoth ? "high" : "medium",
      source: "spreadsheet",
      note: hasBoth
        ? `특수 라벨에서 매출 ${formatMoney(priority.revenue)}, 매입 ${formatMoney(priority.cost)}을 확인했습니다.`
        : "특수 라벨 중 일부 금액을 찾지 못했습니다. 저장 전 금액을 확인해 주세요.",
      matchedLabels: [...new Set(priority.matchedLabels)],
    };
  }

  const revenueCandidates = extractSpreadsheetCandidates(workbook, REVENUE_LABELS);
  const costCandidates = extractSpreadsheetCandidates(workbook, COST_LABELS);
  const genericCandidates = extractSpreadsheetCandidates(workbook, GENERIC_TOTAL_LABELS);
  const revenueCandidate = revenueCandidates[0] ?? genericCandidates[0];
  const costCandidate = costCandidates[0];
  const usedGenericTotal = revenueCandidates.length === 0 && genericCandidates.length > 0;
  const confidence: QuoteConfidence = costCandidate && revenueCandidates.length > 0
    ? "high"
    : usedGenericTotal
      ? "low"
      : "medium";

  return {
    revenue: revenueCandidate?.value ?? null,
    cost: costCandidate?.value ?? null,
    confidence: revenueCandidate || costCandidate ? confidence : "none",
    source: "spreadsheet",
    note: revenueCandidate || costCandidate
      ? [
          `매출 ${formatMoney(revenueCandidate?.value ?? null)}`,
          `매입 ${formatMoney(costCandidate?.value ?? null)}`,
          usedGenericTotal ? "총액·합계만 확인되어 매출로 임시 입력했습니다." : "저장 전 금액을 확인해 주세요.",
        ].join(" / ")
      : "견적서에서 매출·매입으로 볼 수 있는 금액을 찾지 못했습니다. 금액을 직접 입력해 주세요.",
    matchedLabels: uniqueLabels([...revenueCandidates, ...costCandidates, ...(revenueCandidates.length ? [] : genericCandidates)]),
  };
}

/** 업로드된 견적서에서 텍스트를 읽어 금액을 분석한다. 원본 파일은 이 함수에서 저장하지 않는다. */
export async function analyzeQuoteFile(file: File): Promise<QuoteAnalysis> {
  if (!file || file.size === 0) {
    throw new Error("견적서 파일을 선택해 주세요.");
  }

  if (!isPdfFile(file) && !isTextFile(file) && !isSpreadsheetFile(file)) {
    return {
      revenue: null,
      cost: null,
      confidence: "none",
      source: "unsupported",
      note: "이 파일 형식은 금액 분석을 지원하지 않습니다. 원본은 첨부할 수 있지만 금액을 직접 입력해 주세요.",
      matchedLabels: [],
    };
  }

  if (file.size > MAX_PARSE_BYTES) {
    return {
      revenue: null,
      cost: null,
      confidence: "none",
      source: "unsupported",
      note: "분석할 파일은 10MB 이하만 지원합니다. 원본은 첨부할 수 있지만 금액을 직접 입력해 주세요.",
      matchedLabels: [],
    };
  }

  if (isTextFile(file)) {
    return parseQuoteText(await file.text(), "text");
  }

  if (isSpreadsheetFile(file)) {
    try {
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
      return parseSpreadsheetWorkbook(workbook);
    } catch {
      return {
        revenue: null,
        cost: null,
        confidence: "none",
        source: "empty",
        note: "엑셀 견적서 내용을 읽지 못했습니다. 원본은 첨부되지만 금액은 직접 입력해 주세요.",
        matchedLabels: [],
      };
    }
  }

  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const result = await parser.getText();
    return parseQuoteText(result.text, "pdf-text");
  } catch {
    return {
      revenue: null,
      cost: null,
      confidence: "none",
      source: "empty",
      note: "PDF 내용을 읽지 못했습니다. 스캔 이미지 PDF일 수 있으니 금액을 직접 입력해 주세요.",
      matchedLabels: [],
    };
  } finally {
    await parser.destroy();
  }
}
