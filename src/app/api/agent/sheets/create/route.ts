import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import {
  makeSheetsClient,
  makeDriveClientAsOwner,
  isInvalidGrantError,
  LIMITS,
} from "@/lib/googleClient";
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

// owner 계정(dbqls110@gmail.com)으로 폴더 검색/생성
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
    // owner 계정(dbqls110@gmail.com)으로 Drive 클라이언트 생성
    const ownerDrive = makeDriveClientAsOwner();
    // 데이터 쓰기는 서비스 계정 유지
    const sheets = makeSheetsClient();

    // 1. 루트 폴더 확인
    let rootFolderId = process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID ?? "";
    if (!rootFolderId) {
      try {
        rootFolderId = await findOrCreateFolder(ownerDrive, ROOT_FOLDER_NAME);
      } catch (e) {
        if (isInvalidGrantError(e)) {
          return NextResponse.json({
            error: "Google Drive 인증 만료",
            code: "GOOGLE_AUTH_EXPIRED",
            step: "root_folder",
            action: "재시도하지 말 것. 관리자가 /api/admin/drive-setup으로 재인증 필요.",
          }, { status: 503 });
        }
        const msg = e instanceof Error ? e.message : "unknown";
        return NextResponse.json({ error: "루트 폴더 생성 실패", detail: msg, step: "root_folder" }, { status: 502 });
      }
    }

    // 2. 서브폴더 검색 또는 생성 (owner 계정으로)
    let subFolderId: string;
    try {
      subFolderId = await findOrCreateFolder(ownerDrive, rawSubfolder, rootFolderId);
    } catch (e) {
      if (isInvalidGrantError(e)) {
        return NextResponse.json({
          error: "Google Drive 인증 만료",
          code: "GOOGLE_AUTH_EXPIRED",
          step: "subfolder",
          action: "재시도하지 말 것. 관리자가 /api/admin/drive-setup으로 재인증 필요.",
        }, { status: 503 });
      }
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: "서브폴더 생성 실패", detail: msg, step: "subfolder" }, { status: 502 });
    }

    // 3. owner 계정으로 스프레드시트를 서브폴더에 직접 생성
    let spreadsheetId: string;
    try {
      const driveRes = await ownerDrive.files.create({
        requestBody: {
          name: finalTitle,
          mimeType: "application/vnd.google-apps.spreadsheet",
          parents: [subFolderId],
        },
        fields: "id",
      });
      spreadsheetId = driveRes.data.id!;
    } catch (e) {
      if (isInvalidGrantError(e)) {
        return NextResponse.json({
          error: "Google Drive 인증 만료",
          code: "GOOGLE_AUTH_EXPIRED",
          step: "create_file",
          action: "재시도하지 말 것. 관리자가 /api/admin/drive-setup으로 재인증 필요.",
        }, { status: 503 });
      }
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: "파일 생성 실패", detail: msg, step: "create_file", subFolderId }, { status: 502 });
    }
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 4. 탭 구성 (기본 시트 이름 변경 + 추가 탭)
    try {
      const ssInfo = await sheets.spreadsheets.get({ spreadsheetId });
      const defaultSheetId = ssInfo.data.sheets?.[0]?.properties?.sheetId ?? 0;

      const tabRequests: object[] = [
        {
          updateSheetProperties: {
            properties: { sheetId: defaultSheetId, title: safeTabs[0] },
            fields: "title",
          },
        },
        ...safeTabs.slice(1).map((tabTitle) => ({
          addSheet: { properties: { title: tabTitle } },
        })),
      ];

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: tabRequests },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ error: "탭 구성 실패", detail: msg, step: "configure_tabs", spreadsheetId, url }, { status: 502 });
    }

    // 5. 탭별 초기 데이터 입력
    const dataEntries = Object.entries(data).filter(
      ([tabName, rows]) => safeTabs.includes(tabName) && Array.isArray(rows) && rows.length > 0
    );
    if (dataEntries.length > 0) {
      try {
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        return NextResponse.json({ error: "데이터 입력 실패", detail: msg, step: "write_data", spreadsheetId, url }, { status: 502 });
      }
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
