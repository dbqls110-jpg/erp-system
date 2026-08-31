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

function numberPattern(): RegExp {
  // 금액 앞의 통화 기호와 뒤의 한국어 단위를 모두 허용한다.
  return /(?:₩|￦|\$)?\s*([0-9]{1,3}(?:[,\s][0-9]{3})+|[0-9]+(?:\.[0-9]+)?)\s*(억|천만|백만|만원|천원|만|천|원)?/gi;
}

function toMoney(raw: string, unit?: string): number | null {
  const numeric = Number(raw.replace(/[\s,]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;

  const multiplier = unit?.toLowerCase() === "억"
    ? 100_000_000
    : unit === "천만"
      ? 10_000_000
      : unit === "백만"
        ? 1_000_000
        : unit === "만원" || unit === "만"
          ? 10_000
          : unit === "천원" || unit === "천"
            ? 1_000
            : 1;
  const result = Math.round(numeric * multiplier);
  return Number.isSafeInteger(result) ? result : null;
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
        const value = toMoney(moneyMatch[1], moneyMatch[2]);
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

async function spreadsheetText(file: File): Promise<string> {
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  return workbook.SheetNames
    .map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
      const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
      const columns = Array.from({ length: columnCount }, (_, columnIndex) =>
        rows
          .map((row) => String(row[columnIndex] ?? "").trim())
          .filter(Boolean)
          .join("\n"),
      );
      return `${sheetName}\n${columns.filter(Boolean).join("\n")}`;
    })
    .join("\n");
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
      return parseQuoteText(await spreadsheetText(file), "spreadsheet");
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
