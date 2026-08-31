import type { drive_v3 } from "googleapis";

import {
  isInvalidGrantError,
  makeDriveClientAsOwner,
  makeSheetsClient,
} from "@/lib/googleClient";
import {
  LIMITS,
  sanitizeSheetTitle,
  SHEET_AGENT_FOLDER_MAP,
  SHEET_ALLOWED_AGENT_TYPES,
  SHEET_DEFAULT_AGENT_TYPE,
  SHEET_ROOT_FOLDER_NAME,
} from "@/lib/sheetLimits";

export interface SpreadsheetCreateInput {
  agentType?: unknown;
  folderName?: unknown;
  title?: unknown;
  sourcePrompt?: unknown;
  tabs?: unknown;
  data?: unknown;
  dryRun?: boolean;
  /** 메신저 제안은 제한을 넘긴 값을 조용히 자르지 않고 거절해야 한다. */
  strictData?: boolean;
}

export interface PreparedSpreadsheet {
  agentType: string;
  rawSubfolder: string;
  folderPath: string;
  finalTitle: string;
  safeTabs: string[];
  data: Record<string, string[][]>;
  totalCells: number;
  totalRows: number;
}

export interface SpreadsheetCreateResult extends PreparedSpreadsheet {
  spreadsheetId?: string;
  url?: string;
  dryRun?: boolean;
}

export class SheetCreationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SheetCreationError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function generateTitle(sourcePrompt: unknown): string {
  if (!sourcePrompt) return "새 시트";
  const cleaned = sanitizeSheetTitle(String(sourcePrompt), 50);
  return cleaned || "새 시트";
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function quoteSheetRange(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'!A1`;
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string,
): Promise<string> {
  const parentClause = parentId
    ? ` and '${escapeDriveQueryValue(parentId)}' in parents`
    : "";
  const q = `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder'${parentClause} and trashed = false`;

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

function normalizeCell(value: unknown, strict: boolean, field: string): string {
  const raw = String(value ?? "");
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (strict && formulaSafe.length > LIMITS.MAX_CELL_LEN) {
    throw new SheetCreationError(
      `${field} 셀 값이 너무 깁니다. 최대 ${LIMITS.MAX_CELL_LEN}자입니다.`,
      "CELL_VALUE_TOO_LONG",
      400,
    );
  }
  return formulaSafe.slice(0, LIMITS.MAX_CELL_LEN);
}

export function prepareSpreadsheetCreate(input: SpreadsheetCreateInput): PreparedSpreadsheet {
  const strict = input.strictData === true;
  const resolvedAgentType = String(input.agentType ?? SHEET_DEFAULT_AGENT_TYPE);
  if (!SHEET_ALLOWED_AGENT_TYPES.includes(resolvedAgentType as (typeof SHEET_ALLOWED_AGENT_TYPES)[number])) {
    throw new SheetCreationError(
      "agentType은 agent-1 | agent-2 중 하나여야 합니다.",
      "INVALID_AGENT_TYPE",
    );
  }

  const rawSubfolder = input.folderName
    ? sanitizeSheetTitle(String(input.folderName), 50)
    : SHEET_AGENT_FOLDER_MAP[resolvedAgentType];
  if (!rawSubfolder) {
    throw new SheetCreationError("folderName이 유효하지 않습니다.", "INVALID_FOLDER_NAME");
  }

  const finalTitle = input.title
    ? sanitizeSheetTitle(String(input.title), LIMITS.MAX_TITLE_LEN)
    : generateTitle(input.sourcePrompt);
  if (!finalTitle) {
    throw new SheetCreationError(
      "title 또는 sourcePrompt가 필요합니다.",
      "INVALID_TITLE",
    );
  }

  const rawTabs = input.tabs === undefined ? ["Sheet1"] : input.tabs;
  if (!Array.isArray(rawTabs) || rawTabs.length > LIMITS.MAX_TABS) {
    throw new SheetCreationError(
      `tabs는 1~${LIMITS.MAX_TABS}개 배열이어야 합니다.`,
      "INVALID_TABS",
    );
  }
  const safeTabs = [...new Set(rawTabs.map((tab) => String(tab).trim()).filter(Boolean))];
  if (safeTabs.length === 0) safeTabs.push("Sheet1");

  const rawData = input.data === undefined || input.data === null ? {} : asRecord(input.data);
  if (!rawData) {
    throw new SheetCreationError("data는 탭 이름별 행 배열이어야 합니다.", "INVALID_DATA");
  }

  let totalCells = 0;
  let totalRows = 0;
  const normalizedData: Record<string, string[][]> = {};

  for (const [tabName, rawRows] of Object.entries(rawData)) {
    if (!Array.isArray(rawRows)) {
      if (strict) {
        throw new SheetCreationError(
          `${tabName} 데이터가 행 배열이 아닙니다.`,
          "INVALID_DATA",
        );
      }
      continue;
    }

    for (const row of rawRows) {
      if (Array.isArray(row)) totalCells += row.length;
    }
    if (totalCells > LIMITS.MAX_INITIAL_CELLS) {
      throw new SheetCreationError(
        `초기 데이터가 너무 큽니다. 최대 ${LIMITS.MAX_INITIAL_CELLS}개 셀입니다.`,
        "INITIAL_DATA_TOO_LARGE",
      );
    }
    if (strict && rawRows.length > LIMITS.MAX_WRITE_ROWS) {
      throw new SheetCreationError(
        `${tabName} 탭이 너무 깁니다. 최대 ${LIMITS.MAX_WRITE_ROWS}행입니다.`,
        "TOO_MANY_ROWS",
      );
    }

    if (!safeTabs.includes(tabName)) continue;
    const rows = rawRows.slice(0, LIMITS.MAX_WRITE_ROWS);
    normalizedData[tabName] = rows.map((row, rowIndex) => {
      if (!Array.isArray(row)) {
        if (strict) {
          throw new SheetCreationError(
            `${tabName} ${rowIndex + 1}행이 배열이 아닙니다.`,
            "INVALID_DATA",
          );
        }
        return [];
      }
      if (strict && row.length > LIMITS.MAX_COLS) {
        throw new SheetCreationError(
          `${tabName} ${rowIndex + 1}행이 너무 깁니다. 최대 ${LIMITS.MAX_COLS}칸입니다.`,
          "TOO_MANY_COLUMNS",
        );
      }
      totalRows += 1;
      return row.slice(0, LIMITS.MAX_COLS).map((value, columnIndex) =>
        normalizeCell(value, strict, `${tabName} ${rowIndex + 1}행 ${columnIndex + 1}열`),
      );
    });
  }

  return {
    agentType: resolvedAgentType,
    rawSubfolder,
    folderPath: `${SHEET_ROOT_FOLDER_NAME}/${rawSubfolder}`,
    finalTitle,
    safeTabs,
    data: normalizedData,
    totalCells,
    totalRows,
  };
}

export async function createSpreadsheet(
  input: SpreadsheetCreateInput,
): Promise<SpreadsheetCreateResult> {
  const prepared = prepareSpreadsheetCreate(input);
  if (input.dryRun === true) return { ...prepared, dryRun: true };

  let rootFolderId = process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID ?? "";
  const ownerDrive = await makeDriveClientAsOwner();
  const sheets = makeSheetsClient();

  if (!rootFolderId) {
    try {
      rootFolderId = await findOrCreateFolder(ownerDrive, SHEET_ROOT_FOLDER_NAME);
    } catch (error) {
      if (isInvalidGrantError(error)) {
        throw new SheetCreationError(
          "Google Drive 인증 만료",
          "GOOGLE_AUTH_EXPIRED",
          503,
          { step: "root_folder", action: "관리자가 /api/admin/drive-setup으로 재인증해야 합니다." },
        );
      }
      throw new SheetCreationError("루트 폴더 생성 실패", "DRIVE_ROOT_FOLDER_FAILED", 502, {
        detail: error instanceof Error ? error.message : "unknown",
        step: "root_folder",
      });
    }
  }

  let subFolderId: string;
  try {
    subFolderId = await findOrCreateFolder(ownerDrive, prepared.rawSubfolder, rootFolderId);
  } catch (error) {
    if (isInvalidGrantError(error)) {
      throw new SheetCreationError(
        "Google Drive 인증 만료",
        "GOOGLE_AUTH_EXPIRED",
        503,
        { step: "subfolder", action: "관리자가 /api/admin/drive-setup으로 재인증해야 합니다." },
      );
    }
    throw new SheetCreationError("서브폴더 생성 실패", "DRIVE_SUBFOLDER_FAILED", 502, {
      detail: error instanceof Error ? error.message : "unknown",
      step: "subfolder",
    });
  }

  let spreadsheetId: string;
  try {
    const driveRes = await ownerDrive.files.create({
      requestBody: {
        name: prepared.finalTitle,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [subFolderId],
      },
      fields: "id",
    });
    spreadsheetId = driveRes.data.id!;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      throw new SheetCreationError(
        "Google Drive 인증 만료",
        "GOOGLE_AUTH_EXPIRED",
        503,
        { step: "create_file", action: "관리자가 /api/admin/drive-setup으로 재인증해야 합니다." },
      );
    }
    throw new SheetCreationError("파일 생성 실패", "DRIVE_FILE_CREATE_FAILED", 502, {
      detail: error instanceof Error ? error.message : "unknown",
      step: "create_file",
      subFolderId,
    });
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  try {
    const ssInfo = await sheets.spreadsheets.get({ spreadsheetId });
    const defaultSheetId = ssInfo.data.sheets?.[0]?.properties?.sheetId ?? 0;
    const tabRequests: object[] = [
      {
        updateSheetProperties: {
          properties: { sheetId: defaultSheetId, title: prepared.safeTabs[0] },
          fields: "title",
        },
      },
      ...prepared.safeTabs.slice(1).map((tabTitle) => ({
        addSheet: { properties: { title: tabTitle } },
      })),
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: tabRequests },
    });
  } catch (error) {
    throw new SheetCreationError("탭 구성 실패", "SHEET_CONFIGURE_TABS_FAILED", 502, {
      detail: error instanceof Error ? error.message : "unknown",
      step: "configure_tabs",
      spreadsheetId,
      url,
    });
  }

  const dataEntries = Object.entries(prepared.data).filter(([, rows]) => rows.length > 0);
  if (dataEntries.length > 0) {
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: dataEntries.map(([tabName, rows]) => ({
            range: quoteSheetRange(tabName),
            values: rows,
          })),
        },
      });
    } catch (error) {
      throw new SheetCreationError("데이터 입력 실패", "SHEET_WRITE_DATA_FAILED", 502, {
        detail: error instanceof Error ? error.message : "unknown",
        step: "write_data",
        spreadsheetId,
        url,
      });
    }
  }

  return { ...prepared, spreadsheetId, url };
}
