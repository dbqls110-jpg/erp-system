import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { makeSheetsClient, makeDriveClient, LIMITS } from "@/lib/googleClient";
import type { drive_v3 } from "googleapis";

const ROOT_FOLDER_NAME = "Hermes 운영 시트";

const AGENT_FOLDER_MAP: Record<string, string> = {
  hermes: "Hermes",
  marketer: "마케터",
  report: "보고서",
};

function sanitizeTitle(raw: string, maxLen: number = LIMITS.MAX_TITLE_LEN): string {
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trim();
}

function generateTitle(sourcePrompt?: string): string {
  if (!sourcePrompt) return "새 시트";
  const cleaned = sanitizeTitle(sourcePrompt, 50);
  return cleaned || "새 시트";
}

function escapeQ(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// 폴더 검색 (없으면 생성). corpora 제한 없이 접근 가능한 모든 Drive 대상
async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
): Promise<string> {
  const parentClause = parentId ? ` and '${escapeQ(parentId)}' in parents` : "";
  const q = `name = '${escapeQ(name)}' and mimeType = 'application/vnd.google-apps.folder'${parentClause} and trashed = false`;

  const res = await drive.files.list({
    q,
    fields: "files(id, name)",
    pageSize: 1,
    spaces: "drive",
  });

  const existing = res.data.files?.[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });

  return created.data.id!;
}

interface CreateBody {
  agentType?: string;
  folderName?: string;
  title?: string;
  sourcePrompt?: string;
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
    agentType = "hermes",
    folderName,
    title,
    sourcePrompt,
    tabs = ["Sheet1"],
    data = {},
    dryRun = false,
  } = body;

  const rawSubfolder = folderName
    ? sanitizeTitle(String(folderName), 50)
    : (AGENT_FOLDER_MAP[String(agentType)] ?? "Hermes");

  if (!rawSubfolder) {
    return NextResponse.json({ error: "folderName이 유효하지 않습니다." }, { status: 400 });
  }

  const folderPath = `${ROOT_FOLDER_NAME}/${rawSubfolder}`;

  const finalTitle = title
    ? sanitizeTitle(String(title), LIMITS.MAX_TITLE_LEN)
    : generateTitle(sourcePrompt);

  if (!finalTitle) {
    return NextResponse.json({ error: "title 또는 sourcePrompt가 필요합니다." }, { status: 400 });
  }

  if (!Array.isArray(tabs) || tabs.length === 0 || tabs.length > LIMITS.MAX_TABS) {
    return NextResponse.json({ error: `tabs는 1~${LIMITS.MAX_TABS}개 배열이어야 합니다.` }, { status: 400 });
  }
  const safeTabs = [...new Set(tabs.map((t) => String(t).trim()).filter(Boolean))];
  if (safeTabs.length === 0) safeTabs.push("Sheet1");

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

  if (dryRun === true) {
    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/create",
      action: "create_spreadsheet",
      dryRun: true,
      payload: { title: finalTitle, folderPath, tabs: safeTabs, totalCells },
    });
    return NextResponse.json({
      dryRun: true,
      preview: { title: finalTitle, folderPath, tabs: safeTabs },
      message: "dryRun=true: 실제 생성되지 않았습니다.",
    });
  }

  try {
    const drive = makeDriveClient();
    const sheets = makeSheetsClient(true); // create에는 Drive 스코프도 필요

    // 1. 루트 폴더 확인
    let rootFolderId = process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID ?? "";
    if (!rootFolderId) {
      try {
        rootFolderId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        return NextResponse.json({ error: "루트 폴더 생성 실패", detail: msg, step: "root_folder" }, { status: 502 });
      }
    }

    // 2. 서브폴더 검색 또는 생성
    let subFolderId: string;
    try {
      subFolderId = await findOrCreateFolder(drive, rawSubfolder, rootFolderId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: "서브폴더 생성 실패", detail: msg, step: "subfolder", rootFolderId }, { status: 502 });
    }

    // 3. Sheets API로 탭 포함 스프레드시트 생성 (서비스 계정 My Drive에 생성됨)
    let spreadsheetId: string;
    try {
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: finalTitle },
          sheets: safeTabs.map((title) => ({ properties: { title } })),
        },
        fields: "spreadsheetId",
      });
      spreadsheetId = createRes.data.spreadsheetId!;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: "스프레드시트 생성 실패", detail: msg, step: "sheets_create" }, { status: 502 });
    }
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 4. 현재 부모 ID 조회 후 서브폴더로 이동
    try {
      const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: "parents" });
      const currentParents = (fileInfo.data.parents ?? []).join(",");
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: subFolderId,
        ...(currentParents ? { removeParents: currentParents } : {}),
        fields: "id,parents",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: "폴더 이동 실패", detail: msg, step: "move_to_folder", spreadsheetId, url, subFolderId }, { status: 502 });
    }

    // 5. 탭별 초기 데이터 입력
    const dataEntries = Object.entries(data).filter(
      ([tabName, rows]) => safeTabs.includes(tabName) && Array.isArray(rows) && rows.length > 0
    );
    if (dataEntries.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: dataEntries.map(([tabName, rows]) => ({
            range: `'${tabName}'!A1`,
            values: (rows as string[][])
              .slice(0, LIMITS.MAX_WRITE_ROWS)
              .map((row) =>
                Array.isArray(row)
                  ? row.slice(0, LIMITS.MAX_COLS).map((v) => String(v ?? ""))
                  : []
              ),
          })),
        },
      });
    }

    const result = { spreadsheetId, url, title: finalTitle, folderPath };

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/create",
      action: "create_spreadsheet",
      dryRun: false,
      payload: { title: finalTitle, folderPath, tabs: safeTabs, totalCells },
      result: { spreadsheetId, url, folderPath },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google API 오류";
    return NextResponse.json({ error: "스프레드시트 생성 실패", detail: message }, { status: 502 });
  }
}
