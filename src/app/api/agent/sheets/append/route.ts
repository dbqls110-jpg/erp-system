import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { makeSheetsClient, isValidRange, resolveSpreadsheetId, LIMITS } from "@/lib/googleClient";

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
    range: rawRange,
    values,
    dryRun = false,
  } = body as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    range?: string;
    values?: string[][];
    dryRun?: boolean;
  };

  const resolved = resolveSpreadsheetId(rawId, rawUrl ?? null, process.env.GOOGLE_SHEET_ID);
  if (!resolved) {
    const hint = rawUrl
      ? "spreadsheetUrl 형식이 올바르지 않습니다. docs.google.com/spreadsheets URL을 사용하세요."
      : "spreadsheetId 또는 spreadsheetUrl이 필요합니다.";
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  // range 기본값: "A1" — Sheets API append는 데이터가 있는 행 다음에 자동 삽입
  const range = rawRange ?? "A1";
  if (!isValidRange(range)) {
    return NextResponse.json({ error: "range 형식이 올바르지 않습니다. 예: 정리!A:D" }, { status: 400 });
  }
  if (!Array.isArray(values) || values.length === 0) {
    return NextResponse.json({ error: "values는 비어있지 않은 2D 배열이어야 합니다." }, { status: 400 });
  }
  if (values.length > LIMITS.MAX_WRITE_ROWS) {
    return NextResponse.json({ error: `최대 ${LIMITS.MAX_WRITE_ROWS}행까지만 추가할 수 있습니다.` }, { status: 400 });
  }

  const safeValues = values
    .slice(0, LIMITS.MAX_WRITE_ROWS)
    .map((row) =>
      Array.isArray(row) ? row.slice(0, LIMITS.MAX_COLS).map((v) => String(v ?? "")) : []
    );

  if (dryRun === true) {
    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/append",
      action: "append_rows",
      dryRun: true,
      payload: { spreadsheetId: resolved.id, range, rowCount: safeValues.length },
    });
    return NextResponse.json({
      dryRun: true,
      preview: {
        spreadsheetId: resolved.id,
        ...(resolved.gid ? { parsedGid: resolved.gid } : {}),
        range,
        rowCount: safeValues.length,
      },
      message: "dryRun=true: 실제 추가되지 않았습니다.",
    });
  }

  try {
    const sheets = makeSheetsClient();
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: resolved.id,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: safeValues },
    });

    const updates = res.data.updates;

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/append",
      action: "append_rows",
      dryRun: false,
      payload: { spreadsheetId: resolved.id, range, rowCount: safeValues.length },
      result: { updatedRows: updates?.updatedRows, updatedCells: updates?.updatedCells },
    });

    return NextResponse.json({
      spreadsheetId: resolved.id,
      ...(resolved.gid ? { parsedGid: resolved.gid } : {}),
      tableRange: res.data.tableRange,
      updatedRange: updates?.updatedRange,
      updatedRows: updates?.updatedRows,
      updatedCells: updates?.updatedCells,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Sheets API 오류";
    return NextResponse.json({ error: "행 추가 실패", detail: message }, { status: 502 });
  }
}
