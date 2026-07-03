import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { makeSheetsClient, isValidSpreadsheetId, isValidRange, LIMITS } from "@/lib/googleClient";

// GET: 범위 읽기
export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const rawId = searchParams.get("spreadsheetId") ?? process.env.GOOGLE_SHEET_ID ?? "";
  const range = searchParams.get("range") ?? "";

  if (!rawId || !isValidSpreadsheetId(rawId)) {
    return NextResponse.json({ error: "spreadsheetId가 유효하지 않습니다." }, { status: 400 });
  }
  if (!range) {
    return NextResponse.json({ error: "range 파라미터가 필요합니다. 예: 정리!A1:D20" }, { status: 400 });
  }
  if (!isValidRange(range)) {
    return NextResponse.json({ error: "range 형식이 올바르지 않거나 너무 깁니다." }, { status: 400 });
  }

  try {
    const sheets = makeSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: rawId,
      range,
    });

    const values = res.data.values ?? [];
    if (values.length > LIMITS.MAX_READ_ROWS) {
      return NextResponse.json({
        error: `결과가 너무 큽니다 (${values.length}행). range를 좁혀서 최대 ${LIMITS.MAX_READ_ROWS}행 이내로 조회하세요.`,
      }, { status: 400 });
    }

    return NextResponse.json({
      spreadsheetId: rawId,
      range: res.data.range,
      rowCount: values.length,
      colCount: values[0]?.length ?? 0,
      values,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Sheets API 오류";
    return NextResponse.json({ error: "시트 읽기 실패", detail: message }, { status: 502 });
  }
}

// POST: 범위 덮어쓰기
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
    range,
    values,
    dryRun = false,
  } = body as {
    spreadsheetId?: string;
    range?: string;
    values?: string[][];
    dryRun?: boolean;
  };

  const spreadsheetId = rawId ?? process.env.GOOGLE_SHEET_ID ?? "";

  if (!spreadsheetId || !isValidSpreadsheetId(spreadsheetId)) {
    return NextResponse.json({ error: "spreadsheetId가 유효하지 않습니다." }, { status: 400 });
  }
  if (!range || typeof range !== "string" || !isValidRange(range)) {
    return NextResponse.json({ error: "range가 유효하지 않습니다. 예: 정리!A1:B10" }, { status: 400 });
  }
  if (!Array.isArray(values) || values.length === 0) {
    return NextResponse.json({ error: "values는 비어있지 않은 2D 배열이어야 합니다." }, { status: 400 });
  }
  if (values.length > LIMITS.MAX_WRITE_ROWS) {
    return NextResponse.json({ error: `최대 ${LIMITS.MAX_WRITE_ROWS}행까지만 쓸 수 있습니다.` }, { status: 400 });
  }

  const safeValues = values
    .slice(0, LIMITS.MAX_WRITE_ROWS)
    .map((row) =>
      Array.isArray(row) ? row.slice(0, LIMITS.MAX_COLS).map((v) => String(v ?? "")) : []
    );

  if (dryRun === true) {
    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/values",
      action: "write_values",
      dryRun: true,
      payload: { spreadsheetId, range, rowCount: safeValues.length },
    });
    return NextResponse.json({
      dryRun: true,
      preview: {
        spreadsheetId,
        range,
        rowCount: safeValues.length,
        colCount: safeValues[0]?.length ?? 0,
      },
      message: "dryRun=true: 실제 수정되지 않았습니다.",
    });
  }

  try {
    const sheets = makeSheetsClient();
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: safeValues },
    });

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/values",
      action: "write_values",
      dryRun: false,
      payload: { spreadsheetId, range, rowCount: safeValues.length },
      result: { updatedRows: res.data.updatedRows, updatedCells: res.data.updatedCells },
    });

    return NextResponse.json({
      spreadsheetId,
      updatedRange: res.data.updatedRange,
      updatedRows: res.data.updatedRows,
      updatedCells: res.data.updatedCells,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Sheets API 오류";
    return NextResponse.json({ error: "시트 수정 실패", detail: message }, { status: 502 });
  }
}
