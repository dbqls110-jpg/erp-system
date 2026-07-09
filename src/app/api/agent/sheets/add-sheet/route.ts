import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { makeSheetsClient, resolveSpreadsheetId } from "@/lib/googleClient";

// POST /api/agent/sheets/add-sheet
// Google Sheets 스프레드시트에 새 탭(시트)을 추가합니다.
// 동일 제목의 탭이 이미 존재하면 에러 없이 { created: false, exists: true } 반환.

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
    title: rawTitle,
    dryRun = false,
  } = body as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    title?: string;
    dryRun?: boolean;
  };

  // spreadsheetId 결정
  const resolved = resolveSpreadsheetId(rawId, rawUrl ?? null, undefined);
  if (!resolved) {
    const hint = rawUrl
      ? "spreadsheetUrl 형식이 올바르지 않습니다."
      : "spreadsheetId 또는 spreadsheetUrl이 필요합니다.";
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  // title 검증
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title은 필수입니다." }, { status: 400 });
  }
  if (title.length > 100) {
    return NextResponse.json({ error: "title은 100자 이하여야 합니다." }, { status: 400 });
  }
  // Google Sheets 탭 이름에 허용되지 않는 문자 (\, /, *, ?, :, [, ])
  if (/[\\/*?:[\]]/.test(title)) {
    return NextResponse.json(
      { error: "title에 사용할 수 없는 문자가 포함되어 있습니다. (\\, /, *, ?, :, [, ] 불가)" },
      { status: 400 }
    );
  }

  try {
    const sheets = makeSheetsClient();

    // 스프레드시트 메타데이터 조회 → 기존 탭 목록 확인
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: resolved.id,
      fields: "sheets.properties(sheetId,title)",
    });

    const existingSheets = meta.data.sheets ?? [];
    const existingMatch = existingSheets.find(
      (s) => s.properties?.title === title
    );

    if (existingMatch) {
      // 동일 제목 탭 이미 존재 → 에러 없이 exists 반환
      await auditLog({
        method: "POST",
        endpoint: "/api/agent/sheets/add-sheet",
        action: "add_sheet",
        dryRun: false,
        payload: { spreadsheetId: resolved.id, title },
        result: { created: false, exists: true, sheetId: existingMatch.properties?.sheetId },
      });

      return NextResponse.json({
        ok: true,
        created: false,
        exists: true,
        spreadsheetId: resolved.id,
        sheetTitle: title,
        sheetId: existingMatch.properties?.sheetId,
      });
    }

    // dryRun: 실제 생성 없이 미리보기
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        note: "dryRun=true: 실제 탭 생성 없음",
        spreadsheetId: resolved.id,
        sheetTitle: title,
        existingTabCount: existingSheets.length,
      });
    }

    // 탭 생성
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: resolved.id,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title },
            },
          },
        ],
      },
    });

    const addedProps = addRes.data.replies?.[0]?.addSheet?.properties;
    const newSheetId = addedProps?.sheetId;
    const newTitle = addedProps?.title ?? title;

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/add-sheet",
      action: "add_sheet",
      dryRun: false,
      payload: { spreadsheetId: resolved.id, title },
      result: { created: true, sheetId: newSheetId },
    });

    return NextResponse.json({
      ok: true,
      created: true,
      spreadsheetId: resolved.id,
      sheetTitle: newTitle,
      sheetId: newSheetId,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: "탭 생성 실패", detail }, { status: 502 });
  }
}
