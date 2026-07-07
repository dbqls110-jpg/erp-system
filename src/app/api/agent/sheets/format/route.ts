import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { makeSheetsClient, resolveSpreadsheetId } from "@/lib/googleClient";

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

const BORDER_STYLES = ["SOLID", "SOLID_MEDIUM", "SOLID_THICK", "DOTTED", "DASHED", "DOUBLE", "NONE"] as const;
const H_ALIGNMENTS = ["LEFT", "CENTER", "RIGHT"] as const;
const V_ALIGNMENTS = ["TOP", "MIDDLE", "BOTTOM"] as const;
const WRAP_STRATEGIES = ["OVERFLOW_CELL", "CLIP", "WRAP"] as const;

type BorderStyle = typeof BORDER_STYLES[number];
type ColorInput = string | { red?: number; green?: number; blue?: number };

interface BordersInput {
  top?: BorderStyle;
  bottom?: BorderStyle;
  left?: BorderStyle;
  right?: BorderStyle;
  innerHorizontal?: BorderStyle;
  innerVertical?: BorderStyle;
  color?: ColorInput;  // 테두리 색상 (기본값 검정 #000000)
}

interface FormatRequest {
  range: string;                          // A1 notation: "Sheet1!A1:C3" 또는 "A1:C3"
  backgroundColor?: ColorInput;           // 배경색
  textColor?: ColorInput;                 // 글자색
  bold?: boolean;                         // 굵게
  italic?: boolean;                       // 기울임
  strikethrough?: boolean;                // 취소선
  underline?: boolean;                    // 밑줄
  fontSize?: number;                      // 글자 크기 (pt)
  horizontalAlignment?: typeof H_ALIGNMENTS[number];   // 가로 정렬
  verticalAlignment?: typeof V_ALIGNMENTS[number];     // 세로 정렬
  wrapStrategy?: typeof WRAP_STRATEGIES[number];       // 줄바꿈
  borders?: BordersInput;                 // 테두리 설정
  checkbox?: boolean;                     // true=체크박스 추가, false=체크박스 제거
}

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

// hex "#RRGGBB" | "RRGGBB" | "#RGB" 또는 {red,green,blue}(0-1) → Sheets API color
function parseColor(input: ColorInput | undefined | null): { red: number; green: number; blue: number } | null {
  if (input == null) return null;
  if (typeof input === "string") {
    const hex = input.replace(/^#/, "");
    let r: number, g: number, b: number;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return null;
    }
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { red: r / 255, green: g / 255, blue: b / 255 };
  }
  return {
    red: clamp01(typeof input.red === "number" ? input.red : 0),
    green: clamp01(typeof input.green === "number" ? input.green : 0),
    blue: clamp01(typeof input.blue === "number" ? input.blue : 0),
  };
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1; // 0-indexed
}

// A1 notation → { sheetName?, startRow?, endRow?, startCol?, endCol? } (0-indexed, end exclusive)
function parseA1Notation(a1: string): {
  sheetName?: string;
  startRow?: number;
  endRow?: number;
  startCol?: number;
  endCol?: number;
} | null {
  if (!a1 || typeof a1 !== "string") return null;
  let sheetName: string | undefined;
  let cellPart = a1.trim();

  if (cellPart.includes("!")) {
    const idx = cellPart.indexOf("!");
    sheetName = cellPart.slice(0, idx).replace(/^'|'$/g, "").trim();
    cellPart = cellPart.slice(idx + 1).trim();
  }

  const parts = cellPart.split(":");
  if (parts.length > 2) return null;

  const parseCell = (s: string): { col?: number; row?: number } | null => {
    const m = s.match(/^([A-Za-z]*)(\d*)$/);
    if (!m) return null;
    return {
      col: m[1] ? colLettersToIndex(m[1]) : undefined,
      row: m[2] ? parseInt(m[2]) - 1 : undefined, // 0-indexed
    };
  };

  const start = parseCell(parts[0]);
  const end = parseCell(parts[1] ?? parts[0]);
  if (!start || !end) return null;

  return {
    sheetName,
    startRow: start.row,
    endRow: end.row !== undefined ? end.row + 1 : undefined,   // exclusive
    startCol: start.col,
    endCol: end.col !== undefined ? end.col + 1 : undefined,   // exclusive
  };
}

function buildGridRange(parsed: NonNullable<ReturnType<typeof parseA1Notation>>, sheetId: number) {
  const range: Record<string, number> = { sheetId };
  if (parsed.startRow !== undefined) range.startRowIndex = parsed.startRow;
  if (parsed.endRow !== undefined) range.endRowIndex = parsed.endRow;
  if (parsed.startCol !== undefined) range.startColumnIndex = parsed.startCol;
  if (parsed.endCol !== undefined) range.endColumnIndex = parsed.endCol;
  return range;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    spreadsheetId: rawId,
    spreadsheetUrl: rawUrl,
    requests: rawRequests,
    dryRun = false,
  } = body as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    requests?: unknown[];
    dryRun?: boolean;
  };

  // spreadsheetId 결정
  const resolved = resolveSpreadsheetId(rawId, rawUrl ?? null, undefined);
  if (!resolved) {
    const hint = rawUrl
      ? "spreadsheetUrl 형식이 올바르지 않습니다. docs.google.com/spreadsheets URL을 사용하세요."
      : "spreadsheetId 또는 spreadsheetUrl이 필요합니다.";
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  if (!Array.isArray(rawRequests) || rawRequests.length === 0) {
    return NextResponse.json({ error: "requests는 비어있지 않은 배열이어야 합니다." }, { status: 400 });
  }
  if (rawRequests.length > 50) {
    return NextResponse.json({ error: "한 번에 최대 50개 요청까지 처리할 수 있습니다." }, { status: 400 });
  }

  const formatRequests = rawRequests as FormatRequest[];

  // 입력 검증
  const parsedRanges: NonNullable<ReturnType<typeof parseA1Notation>>[] = [];
  for (const [i, fmtReq] of formatRequests.entries()) {
    if (!fmtReq.range || typeof fmtReq.range !== "string") {
      return NextResponse.json({ error: `requests[${i}].range가 필요합니다.` }, { status: 400 });
    }
    const parsed = parseA1Notation(fmtReq.range);
    if (!parsed) {
      return NextResponse.json({ error: `requests[${i}].range 형식이 올바르지 않습니다: "${fmtReq.range}"` }, { status: 400 });
    }
    if (fmtReq.horizontalAlignment && !H_ALIGNMENTS.includes(fmtReq.horizontalAlignment as typeof H_ALIGNMENTS[number])) {
      return NextResponse.json({ error: `requests[${i}].horizontalAlignment은 LEFT | CENTER | RIGHT 중 하나여야 합니다.` }, { status: 400 });
    }
    if (fmtReq.verticalAlignment && !V_ALIGNMENTS.includes(fmtReq.verticalAlignment as typeof V_ALIGNMENTS[number])) {
      return NextResponse.json({ error: `requests[${i}].verticalAlignment은 TOP | MIDDLE | BOTTOM 중 하나여야 합니다.` }, { status: 400 });
    }
    if (fmtReq.wrapStrategy && !WRAP_STRATEGIES.includes(fmtReq.wrapStrategy as typeof WRAP_STRATEGIES[number])) {
      return NextResponse.json({ error: `requests[${i}].wrapStrategy은 OVERFLOW_CELL | CLIP | WRAP 중 하나여야 합니다.` }, { status: 400 });
    }
    if (fmtReq.borders) {
      for (const side of ["top", "bottom", "left", "right", "innerHorizontal", "innerVertical"] as const) {
        const style = fmtReq.borders[side];
        if (style && !BORDER_STYLES.includes(style)) {
          return NextResponse.json({ error: `requests[${i}].borders.${side}는 ${BORDER_STYLES.join(" | ")} 중 하나여야 합니다.` }, { status: 400 });
        }
      }
    }
    parsedRanges.push(parsed);
  }

  // dryRun: 실제 API 호출 없이 preview 반환
  if (dryRun === true) {
    const preview = formatRequests.map((r, i) => ({
      range: r.range,
      parsedRange: parsedRanges[i],
      operations: [
        r.backgroundColor !== undefined && "backgroundColor",
        r.textColor !== undefined && "textColor",
        r.bold !== undefined && `bold=${r.bold}`,
        r.italic !== undefined && `italic=${r.italic}`,
        r.strikethrough !== undefined && `strikethrough=${r.strikethrough}`,
        r.underline !== undefined && `underline=${r.underline}`,
        r.fontSize !== undefined && `fontSize=${r.fontSize}`,
        r.horizontalAlignment !== undefined && `horizontalAlignment=${r.horizontalAlignment}`,
        r.verticalAlignment !== undefined && `verticalAlignment=${r.verticalAlignment}`,
        r.wrapStrategy !== undefined && `wrapStrategy=${r.wrapStrategy}`,
        r.borders !== undefined && "borders",
        r.checkbox === true && "addCheckbox",
        r.checkbox === false && "removeCheckbox",
      ].filter(Boolean),
    }));
    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/format",
      action: "format_cells",
      dryRun: true,
      payload: { spreadsheetId: resolved.id, requestCount: formatRequests.length },
    });
    return NextResponse.json({ dryRun: true, preview, message: "dryRun=true: 실제 적용되지 않았습니다." });
  }

  try {
    const sheets = makeSheetsClient();

    // 시트(탭) 목록 조회 → sheetId 맵 구성
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: resolved.id,
      fields: "sheets.properties",
    });
    const sheetsList = meta.data.sheets ?? [];
    const sheetIdMap = new Map<string, number>(
      sheetsList.map((s) => [s.properties?.title ?? "", s.properties?.sheetId ?? 0])
    );
    const defaultSheetId = sheetsList[0]?.properties?.sheetId ?? 0;

    // 시트명 존재 검증
    for (const [i, parsed] of parsedRanges.entries()) {
      if (parsed.sheetName && !sheetIdMap.has(parsed.sheetName)) {
        return NextResponse.json(
          { error: `requests[${i}]: 시트(탭)를 찾을 수 없습니다: "${parsed.sheetName}"` },
          { status: 400 }
        );
      }
    }

    // batchUpdate 요청 배열 구성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiRequests: any[] = [];

    for (const [i, fmtReq] of formatRequests.entries()) {
      const parsed = parsedRanges[i];
      const sheetId = parsed.sheetName ? sheetIdMap.get(parsed.sheetName)! : defaultSheetId;
      const gridRange = buildGridRange(parsed, sheetId);

      // ── 1) repeatCell: 셀 서식 (배경색·글자색·글꼴·정렬 등) ──────────────
      const userEnteredFormat: Record<string, unknown> = {};
      const fields: string[] = [];

      const bgColor = parseColor(fmtReq.backgroundColor);
      if (bgColor) {
        userEnteredFormat.backgroundColor = bgColor;
        fields.push("userEnteredFormat.backgroundColor");
      }

      const textFormat: Record<string, unknown> = {};
      const fgColor = parseColor(fmtReq.textColor);
      if (fgColor) {
        textFormat.foregroundColor = fgColor;
        fields.push("userEnteredFormat.textFormat.foregroundColor");
      }
      if (fmtReq.bold !== undefined) {
        textFormat.bold = fmtReq.bold;
        fields.push("userEnteredFormat.textFormat.bold");
      }
      if (fmtReq.italic !== undefined) {
        textFormat.italic = fmtReq.italic;
        fields.push("userEnteredFormat.textFormat.italic");
      }
      if (fmtReq.strikethrough !== undefined) {
        textFormat.strikethrough = fmtReq.strikethrough;
        fields.push("userEnteredFormat.textFormat.strikethrough");
      }
      if (fmtReq.underline !== undefined) {
        textFormat.underline = fmtReq.underline;
        fields.push("userEnteredFormat.textFormat.underline");
      }
      if (fmtReq.fontSize !== undefined && typeof fmtReq.fontSize === "number" && fmtReq.fontSize > 0) {
        textFormat.fontSize = Math.floor(fmtReq.fontSize);
        fields.push("userEnteredFormat.textFormat.fontSize");
      }
      if (Object.keys(textFormat).length > 0) userEnteredFormat.textFormat = textFormat;

      if (fmtReq.horizontalAlignment) {
        userEnteredFormat.horizontalAlignment = fmtReq.horizontalAlignment;
        fields.push("userEnteredFormat.horizontalAlignment");
      }
      if (fmtReq.verticalAlignment) {
        userEnteredFormat.verticalAlignment = fmtReq.verticalAlignment;
        fields.push("userEnteredFormat.verticalAlignment");
      }
      if (fmtReq.wrapStrategy) {
        userEnteredFormat.wrapStrategy = fmtReq.wrapStrategy;
        fields.push("userEnteredFormat.wrapStrategy");
      }

      if (fields.length > 0) {
        apiRequests.push({
          repeatCell: {
            range: gridRange,
            cell: { userEnteredFormat },
            fields: fields.join(","),
          },
        });
      }

      // ── 2) updateBorders: 테두리 ───────────────────────────────────────────
      if (fmtReq.borders) {
        const bdrColor = parseColor(fmtReq.borders.color) ?? { red: 0, green: 0, blue: 0 };
        const makeBorder = (style: BorderStyle) => ({
          style,
          colorStyle: { rgbColor: bdrColor },
        });
        const borderReq: Record<string, unknown> = { range: gridRange };
        if (fmtReq.borders.top) borderReq.top = makeBorder(fmtReq.borders.top);
        if (fmtReq.borders.bottom) borderReq.bottom = makeBorder(fmtReq.borders.bottom);
        if (fmtReq.borders.left) borderReq.left = makeBorder(fmtReq.borders.left);
        if (fmtReq.borders.right) borderReq.right = makeBorder(fmtReq.borders.right);
        if (fmtReq.borders.innerHorizontal) borderReq.innerHorizontal = makeBorder(fmtReq.borders.innerHorizontal);
        if (fmtReq.borders.innerVertical) borderReq.innerVertical = makeBorder(fmtReq.borders.innerVertical);
        apiRequests.push({ updateBorders: borderReq });
      }

      // ── 3) setDataValidation: 체크박스 ────────────────────────────────────
      if (fmtReq.checkbox === true) {
        apiRequests.push({
          setDataValidation: {
            range: gridRange,
            rule: { condition: { type: "BOOLEAN" }, showCustomUi: true },
          },
        });
      } else if (fmtReq.checkbox === false) {
        // rule 없이 보내면 기존 validation 제거
        apiRequests.push({ setDataValidation: { range: gridRange } });
      }
    }

    if (apiRequests.length === 0) {
      return NextResponse.json(
        { error: "적용할 서식 요청이 없습니다. backgroundColor, textColor, bold, borders, checkbox 중 하나 이상 지정하세요." },
        { status: 400 }
      );
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: resolved.id,
      requestBody: { requests: apiRequests },
    });

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/format",
      action: "format_cells",
      dryRun: false,
      payload: { spreadsheetId: resolved.id, requestCount: formatRequests.length },
      result: { apiRequestCount: apiRequests.length },
    });

    return NextResponse.json({
      ok: true,
      spreadsheetId: resolved.id,
      appliedRequests: formatRequests.length,
      apiRequestCount: apiRequests.length,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Google Sheets API 오류";
    return NextResponse.json({ error: "시트 서식 적용 실패", detail }, { status: 502 });
  }
}
