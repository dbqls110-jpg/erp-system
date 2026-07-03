import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { makeSheetsClient, isValidSpreadsheetId, isValidRange, LIMITS } from "@/lib/googleClient";

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
    return NextResponse.json({ error: "range가 유효하지 않습니다. 예: 정리!A:D" }, { status: 400 });
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
      payload: { spreadsheetId, range, rowCount: safeValues.length },
    });
    return NextResponse.json({
      dryRun: true,
      preview: {
        spreadsheetId,
        range,
        rowCount: safeValues.length,
      },
      message: "dryRun=true: 실제 추가되지 않았습니다.",
    });
  }

  try {
    const sheets = makeSheetsClient();
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
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
      payload: { spreadsheetId, range, rowCount: safeValues.length },
      result: { updatedRows: updates?.updatedRows, updatedCells: updates?.updatedCells },
    });

    return NextResponse.json({
      spreadsheetId,
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
