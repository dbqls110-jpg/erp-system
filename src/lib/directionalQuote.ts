import * as XLSX from "xlsx";
import type { QuoteAnalysis } from "@/lib/quoteParser";
import { quoteItemsFromJson } from "@/lib/quoteItems";

type Kind = "revenue" | "cost";
type Cell = string | number | null | undefined;
type Row = Cell[];
type PlacedText = { x: number; y: number; text: string };
type Header = { name: number; quantity: number; unitPrice: number; amount: number };
type TotalKind = "gross" | "total" | "net" | "tax";

function label(cell: Cell) {
  return String(cell ?? "").normalize("NFKC").replace(/\s+/gu, "").replace(/[:：]$/u, "").toUpperCase();
}

function number(cell: Cell, decimal = false) {
  const raw = String(cell ?? "").normalize("NFKC").trim().replace(/^[₩￦]\s*/u, "").replace(/\s*원$/u, "");
  if (!(decimal ? /^\d+(?:\.\d+)?$/u : /^(?:\d+|\d{1,3}(?:,\d{3})+)$/u).test(raw)) return null;
  const value = Number(raw.replace(/,/gu, ""));
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
}

function totalKind(value: string, kind: Kind): TotalKind | null {
  if (/^(?:(?:부가세|부가가치세|VAT)포함(?:금액|합계)?|(?:총합계|총액|총견적금액)(?:\((?:부가세|VAT)포함\)))$/u.test(value)) return "gross";
  if (/^(?:공급가액(?:합계)?|공급금액|(?:부가세|VAT)별도(?:금액)?)$/u.test(value)) return "net";
  if (/^(?:부가세|부가가치세|VAT)(?:액|금액|합계)?$/u.test(value)) return "tax";
  if (/^(?:총(?:견적(?:금액|가)|합계(?:금액|액)?|액)|합계(?:금액|액)?|견적(?:금액|가)|청구금액|계약금액)$/u.test(value)
    || (kind === "revenue" ? /^매출(?:금액|액)$/u : /^매입(?:금액|액)$/u).test(value)) return "total";
  return null;
}

function header(row: Row): Header | null {
  const cells = row.map(label);
  let name = cells.findIndex(value => /^(?:품명|품목명|품목및규격)$/u.test(value));
  if (name < 0) name = cells.indexOf("품목");
  const quantity = cells.findIndex(value => /^(?:수량|QTY)$/u.test(value));
  const unitPrice = cells.findIndex(value => /^(?:단가|단가\(원\))$/u.test(value));
  const amount = cells.findIndex(value => /^(?:금액|금액\(원\)|공급가액)$/u.test(value));
  return name >= 0 && quantity > name && unitPrice > quantity && amount > unitPrice ? { name, quantity, unitPrice, amount } : null;
}

function parseBlock(rows: Row[], kind: Kind) {
  const totals: Record<TotalKind, Set<number>> = { gross: new Set(), total: new Set(), net: new Set(), tax: new Set() };
  const itemRows: unknown[] = [];
  let columns: Header | null = null;
  for (const row of rows) {
    const headings = header(row);
    if (headings) { columns = headings; continue; }
    let isTotal = false;
    for (const [index, cell] of row.entries()) {
      const item = String(cell ?? "").trim();
      const inline = item.match(/^(.+?)\s*[:：]\s*([₩￦]?\s*[\d,]+\s*원?)$/u);
      const category = totalKind(label(inline?.[1] ?? cell), kind);
      if (!category) continue;
      // Sum labels in an item-name cell may be real products; do not infer a
      // document total from a row with quantity, unit price and line amount.
      if (columns && number(row[columns.quantity], true) !== null && number(row[columns.unitPrice]) !== null && number(row[columns.amount]) !== null) continue;
      isTotal = true;
      const amount = inline ? number(inline[2]) : row.slice(index + 1).map(value => number(value)).find(value => value !== null) ?? null;
      if (amount !== null) totals[category].add(amount);
    }
    if (isTotal) { columns = null; continue; }
    if (!columns || kind !== "cost") continue;
    itemRows.push({
      name: String(row[columns.name] ?? "").trim(), quantity: number(row[columns.quantity], true),
      unitPrice: number(row[columns.unitPrice]), amount: number(row[columns.amount]),
    });
  }
  const single = (values: Set<number>) => values.size === 1 ? [...values][0] : null;
  const net = single(totals.net);
  const tax = single(totals.tax);
  const explicitGross = single(totals.gross);
  const declared = single(totals.total);
  const withTax = net !== null && tax !== null && Number.isSafeInteger(net + tax) ? net + tax : null;
  const amount = totals.gross.size > 1 ? null
    : explicitGross ?? (totals.total.size > 1 ? null : withTax ?? (declared === net && net !== null ? null : declared));
  const items = quoteItemsFromJson(itemRows);
  const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
  return { amount, items, completeItems: items.length > 0 && itemTotal === (net ?? amount) };
}

function asSpreadsheetRows(sheet: XLSX.WorkSheet) {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  range.e.r = Math.min(range.e.r, range.s.r + 999);
  range.e.c = Math.min(range.e.c, range.s.c + 49);
  return XLSX.utils.sheet_to_json<Row>(sheet, { range, header: 1, raw: true, blankrows: false });
}

function orderPdfRows(text: PlacedText[], kind: Kind): Row[] {
  const visual: Array<{ y: number; cells: PlacedText[] }> = [];
  for (const item of text.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = visual.at(-1);
    if (line && Math.abs(line.y - item.y) <= 2.5) line.cells.push(item);
    else visual.push({ y: item.y, cells: [item] });
  }
  const rows: Row[] = [];
  let columns: { edges: number[]; minName: number; start: number } | null = null;
  let qtyRows: Array<{ row: Row; y: number; names: PlacedText[] }> = [];
  let wrapped: PlacedText[] = [];
  function commitItems() {
    for (const text of wrapped) {
      const byDistance = qtyRows.map(row => ({ row, distance: Math.abs(row.y - text.y) })).sort((a, b) => a.distance - b.distance);
      const nearest = byDistance[0];
      if (nearest && nearest.distance <= 12 && byDistance[1]?.distance !== nearest.distance) nearest.row.names.push(text);
    }
    rows.push(...qtyRows.map(({ row, names }) => {
      row[0] = names.sort((a, b) => b.y - a.y || a.x - b.x).map(item => item.text).join(" ");
      return row;
    }));
    qtyRows = [];
    wrapped = [];
  }
  for (const line of visual) {
    const cells = line.cells.sort((a, b) => a.x - b.x);
    const values = cells.map(item => item.text);
    const table = header(values);
    if (table) {
      commitItems();
      const [name, qty, price, amount] = [table.name, table.quantity, table.unitPrice, table.amount].map(i => cells[i].x);
      columns = { edges: [(name + qty) / 2, (qty + price) / 2, (price + amount) / 2],
        // Centered headers and long item names do not share the same left edge.
        minName: table.name > 0 ? cells[table.name - 1].x + Math.min(15, (name - cells[table.name - 1].x) / 2) : -Infinity,
        start: line.y };
      rows.push(["품명", "수량", "단가", "금액"]);
      continue;
    }
    if (!columns || cells.some(item => totalKind(label(item.text), kind))) {
      commitItems();
      columns = null;
      rows.push(values);
      continue;
    }
    const [qty, price, amount] = columns.edges;
    const parts = cells.filter(item => item.x >= columns!.minName);
    const names = parts.filter(item => item.x < qty && !item.text.startsWith("*"));
    const row: Row = [null, ...[[qty, price], [price, amount], [amount, Infinity]].map(([left, right]) =>
      parts.filter(item => item.x >= left && item.x < right).map(item => item.text).join("").trim() || null)];
    if (number(row[1], true) !== null && number(row[2]) !== null && number(row[3]) !== null) {
      qtyRows.push({ row, y: line.y, names });
    } else if (parts.length === names.length && columns.start - line.y > 3) {
      wrapped.push(...names);
    }
  }
  commitItems();
  return rows;
}

export async function parseDirectionalQuote(file: File, kind: Kind, format: "pdf-text" | "spreadsheet" | "text"): Promise<QuoteAnalysis> {
  const failure: QuoteAnalysis = { revenue: null, cost: null, confidence: "none", source: format,
    note: "견적서 합계를 확실히 읽지 못했습니다. 원본은 첨부하고 금액은 자동 반영하지 않습니다.", matchedLabels: [] };
  try {
    let sections: Row[][];
    if (format === "pdf-text") {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false,
        useSystemFonts: true, disableFontFace: true, stopAtErrors: true });
      try {
        const pdf = await task.promise;
        if (pdf.numPages > 20) return failure;
        const rows: Row[] = [];
        for (let index = 1; index <= pdf.numPages; index++) {
          const page = await pdf.getPage(index);
          const content = await page.getTextContent();
          if (content.items.length > 15_000) return failure;
          rows.push(...orderPdfRows(content.items.flatMap(item => "str" in item && item.str.trim()
            ? [{ x: item.transform[4], y: item.transform[5], text: item.str.trim() }] : []), kind));
        }
        sections = [rows];
      } finally { await task.destroy(); }
    } else if (format === "spreadsheet") {
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", sheetRows: 1000 });
      sections = workbook.SheetNames.slice(0, 20).map(name => asSpreadsheetRows(workbook.Sheets[name]));
    } else {
      sections = [(await file.text()).split(/\r?\n/u).slice(0, 1000).map(line => line.split(/\t|\s*\|\s*/u))];
    }
    const matches = sections.map(rows => parseBlock(rows, kind)).filter(value => value.amount !== null && value.amount > 0);
    if (matches.length !== 1) return failure;
    const { amount, items, completeItems } = matches[0];
    const noun = kind === "cost" ? "매입" : "매출";
    const total = amount!.toLocaleString("ko-KR");
    const note = kind === "cost" ? completeItems ? `매입 ${total}원 · 품목 ${items.length}건 확인`
      : `매입 ${total}원 · 품목 내역은 원본에서 확인해 주세요.` : `${noun} ${total}원 확인`;
    return { revenue: kind === "revenue" ? amount : null, cost: kind === "cost" ? amount : null, confidence: "high",
      source: format, note, matchedLabels: ["견적서 합계"], ...(completeItems ? { items } : {}) };
  } catch { return failure; }
}
