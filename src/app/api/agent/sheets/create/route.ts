import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import {
  makeSheetsClient,
  makeDriveClient,
  resolveFolderAlias,
  LIMITS,
} from "@/lib/googleClient";

interface CreateBody {
  title?: string;
  folder?: string;
  tabs?: string[];
  data?: Record<string, string[][]>;
  dryRun?: boolean;
}

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    title,
    folder,
    tabs = ["Sheet1"],
    data = {},
    dryRun = false,
  } = body;

  // 유효성 검사
  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title은 필수입니다." }, { status: 400 });
  }
  if (title.length > LIMITS.MAX_TITLE_LEN) {
    return NextResponse.json({ error: `title은 ${LIMITS.MAX_TITLE_LEN}자 이내여야 합니다.` }, { status: 400 });
  }
  if (!Array.isArray(tabs) || tabs.length === 0 || tabs.length > LIMITS.MAX_TABS) {
    return NextResponse.json({ error: `tabs는 1~${LIMITS.MAX_TABS}개 배열이어야 합니다.` }, { status: 400 });
  }

  // 폴더 alias 확인
  let folderId: string | null = null;
  if (folder) {
    folderId = resolveFolderAlias(folder);
    if (!folderId) {
      return NextResponse.json({
        error: `알 수 없는 folder alias: "${folder}". GET /api/agent/sheets/folders 로 사용 가능한 alias를 확인하세요.`,
      }, { status: 400 });
    }
  }

  // 초기 데이터 셀 수 제한
  let totalCells = 0;
  for (const rows of Object.values(data)) {
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (Array.isArray(row)) totalCells += row.length;
      }
    }
  }
  if (totalCells > LIMITS.MAX_INITIAL_CELLS) {
    return NextResponse.json({
      error: `초기 데이터가 너무 큽니다. 최대 ${LIMITS.MAX_INITIAL_CELLS}개 셀.`,
    }, { status: 400 });
  }

  const safeTitle = title.trim();
  const safeTabs = [...new Set(tabs.map((t) => String(t).trim()).filter(Boolean))];

  // dryRun: 실제 생성 없이 미리보기만
  if (dryRun === true) {
    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/create",
      action: "create_spreadsheet",
      dryRun: true,
      payload: { title: safeTitle, folder: folder ?? null, tabs: safeTabs, totalCells },
    });
    return NextResponse.json({
      dryRun: true,
      preview: {
        title: safeTitle,
        folder: folder ?? null,
        tabs: safeTabs,
        dataTabCount: Object.keys(data).length,
        totalCells,
      },
      message: "dryRun=true: 실제 생성되지 않았습니다.",
    });
  }

  try {
    const sheets = makeSheetsClient(Boolean(folderId));

    // 스프레드시트 생성 (탭 포함)
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: safeTitle },
        sheets: safeTabs.map((tabTitle, idx) => ({
          properties: { title: tabTitle, sheetId: idx },
        })),
      },
    });

    const spreadsheetId = createRes.data.spreadsheetId!;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 탭별 초기 데이터 입력
    const dataEntries = Object.entries(data).filter(
      ([tabName, rows]) => safeTabs.includes(tabName) && Array.isArray(rows) && rows.length > 0
    );
    if (dataEntries.length > 0) {
      const batchData = dataEntries.map(([tabName, rows]) => {
        const safeRows = (rows as string[][])
          .slice(0, LIMITS.MAX_WRITE_ROWS)
          .map((row) =>
            Array.isArray(row)
              ? row.slice(0, LIMITS.MAX_COLS).map((v) => String(v ?? ""))
              : []
          );
        return {
          range: `'${tabName}'!A1`,
          values: safeRows,
        };
      });

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: batchData,
        },
      });
    }

    // 폴더로 이동 (서비스 계정에 해당 폴더 편집 권한이 있어야 함)
    let folderMoved = false;
    if (folderId) {
      try {
        const drive = makeDriveClient();
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: folderId,
          removeParents: "root",
          fields: "id,parents",
        });
        folderMoved = true;
      } catch {
        // 폴더 이동 실패는 치명적이지 않음 - 시트는 정상 생성됨
      }
    }

    const result = {
      spreadsheetId,
      url,
      title: safeTitle,
      folder: folder ?? null,
      folderMoved,
      tabs: safeTabs,
    };

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/create",
      action: "create_spreadsheet",
      dryRun: false,
      payload: { title: safeTitle, folder: folder ?? null, tabs: safeTabs, totalCells },
      result: { spreadsheetId, url, folderMoved },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Sheets API 오류";
    return NextResponse.json({ error: "스프레드시트 생성 실패", detail: message }, { status: 502 });
  }
}
