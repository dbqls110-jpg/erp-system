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

// Drive API query에서 single quote 이스케이프
function escapeQ(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// 이름으로 폴더 검색, 없으면 생성
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
    corpora: "user",
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

  // 서브폴더명 결정
  const rawSubfolder = folderName
    ? sanitizeTitle(String(folderName), 50)
    : (AGENT_FOLDER_MAP[String(agentType)] ?? "Hermes");

  if (!rawSubfolder) {
    return NextResponse.json({ error: "folderName이 유효하지 않습니다." }, { status: 400 });
  }

  const folderPath = `${ROOT_FOLDER_NAME}/${rawSubfolder}`;

  // 제목 결정
  const finalTitle = title
    ? sanitizeTitle(String(title), LIMITS.MAX_TITLE_LEN)
    : generateTitle(sourcePrompt);

  if (!finalTitle) {
    return NextResponse.json({ error: "title 또는 sourcePrompt가 필요합니다." }, { status: 400 });
  }

  // 탭 검증
  if (!Array.isArray(tabs) || tabs.length === 0 || tabs.length > LIMITS.MAX_TABS) {
    return NextResponse.json({ error: `tabs는 1~${LIMITS.MAX_TABS}개 배열이어야 합니다.` }, { status: 400 });
  }
  const safeTabs = [...new Set(tabs.map((t) => String(t).trim()).filter(Boolean))];

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

  // dryRun: 실제 생성 없이 preview만 반환
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
    const sheets = makeSheetsClient();
    const drive = makeDriveClient();

    // 1. 루트 폴더 ID 확인 (env 우선, 없으면 검색/생성)
    let rootFolderId = process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID ?? "";
    if (!rootFolderId) {
      rootFolderId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
    }

    // 2. 서브폴더 검색 또는 생성
    const subFolderId = await findOrCreateFolder(drive, rawSubfolder, rootFolderId);

    // 3. 스프레드시트 생성
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: finalTitle },
        sheets: safeTabs.map((tabTitle, idx) => ({
          properties: { title: tabTitle, sheetId: idx },
        })),
      },
    });

    const spreadsheetId = createRes.data.spreadsheetId!;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 4. 탭별 초기 데이터 입력
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

    // 5. 서브폴더로 이동
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: subFolderId,
      removeParents: "root",
      fields: "id,parents",
    });

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
