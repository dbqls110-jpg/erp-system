import { makeSheetsClientAsOwner } from "@/lib/googleClient";
import {
  appendProjectSheetRow,
  type ProjectSheetRowInput,
} from "@/lib/inquirySheet";
import {
  findSpaceRentalRows,
  isSpaceRentalStage,
  parseSpaceRentalRows,
  type SpaceRentalIdentity,
  type SpaceRentalRecord,
  type SpaceRentalStage,
} from "@/lib/spaceRentals";
import { formatCurrentDateTime } from "@/lib/inquiries";

export const SPACE_RENTALS_SPREADSHEET_ID = "1TH5sjW6aOMnInVRI1Rr6OdZ76cyQ6Ph4D4xX0DagHcw";
export const SPACE_RENTALS_TAB_NAME = "진행 고객";

const SPACE_RENTALS_RANGE = `'${SPACE_RENTALS_TAB_NAME}'!A1:AM`;
const PROJECT_NAME_COLUMN = "AL";
const STAGE_TIME_COLUMNS: Partial<Record<SpaceRentalStage, string>> = {
  "1차 연락": "AI",
  "2차 연락": "AJ",
  종료: "AK",
  성사: "AM",
};
const CLOSED_ROW_BACKGROUND = { red: 0.9, green: 0.9, blue: 0.9 };
/** 종료 행의 회색을 지울 때 검정이 되지 않도록 실제 기본 흰색을 다시 쓴다. */
const DEFAULT_ROW_BACKGROUND = { red: 1, green: 1, blue: 1 };
const SPACE_RENTAL_HEADERS = [
  "1차 연락일시",
  "2차 연락일시",
  "종료일시",
  "프로젝트명",
  "성사일시",
] as const;

type SheetRows = readonly (readonly unknown[])[];
type SheetsClient = Awaited<ReturnType<typeof makeSheetsClientAsOwner>>;

async function ensureSpaceRentalHeaders(
  sheets: SheetsClient,
  rows: SheetRows,
): Promise<void> {
  const header = rows[0] ?? [];
  for (const [offset, value] of SPACE_RENTAL_HEADERS.entries()) {
    if (String(header[34 + offset] ?? "").trim()) continue;
    const column = ["AI", "AJ", "AK", "AL", "AM"][offset];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPACE_RENTALS_SPREADSHEET_ID,
      range: `'${SPACE_RENTALS_TAB_NAME}'!${column}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[value]] },
    });
  }
}

async function readSpaceRentalSheet() {
  const sheets = await makeSheetsClientAsOwner();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPACE_RENTALS_SPREADSHEET_ID,
    range: SPACE_RENTALS_RANGE,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = (response.data.values ?? []) as SheetRows;
  await ensureSpaceRentalHeaders(sheets, rows);
  return { sheets, rows };
}

export async function getSpaceRentals(): Promise<SpaceRentalRecord[]> {
  const { rows } = await readSpaceRentalSheet();
  return parseSpaceRentalRows(rows);
}

function locateUniqueRow(rows: SheetRows, identity: SpaceRentalIdentity) {
  const matches = findSpaceRentalRows(rows, identity);
  if (matches.length === 0) {
    throw new Error("시트에서 공간대관 행을 다시 찾지 못했습니다. 시트가 수정됐을 수 있습니다.");
  }
  if (matches.length > 1) {
    throw new Error("같은 구분·예약번호·이메일의 공간대관 행이 여러 개라 안전하게 저장하지 않았습니다.");
  }
  return matches[0];
}

async function getSheetId(sheets: SheetsClient): Promise<number> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: SPACE_RENTALS_SPREADSHEET_ID,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = response.data.sheets?.find((item) => item.properties?.title === SPACE_RENTALS_TAB_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (typeof sheetId !== "number") throw new Error(`‘${SPACE_RENTALS_TAB_NAME}’ 탭을 찾지 못했습니다.`);
  return sheetId;
}

function columnIndex(column: string): number {
  return [...column].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function rowRange(sheetId: number, rowNumber: number, startColumn: string, endColumn: string) {
  return {
    sheetId,
    startRowIndex: rowNumber - 1,
    endRowIndex: rowNumber,
    startColumnIndex: columnIndex(startColumn),
    endColumnIndex: columnIndex(endColumn) + 1,
  };
}

export async function saveSpaceRentalStage(
  identity: SpaceRentalIdentity,
  nextStage: SpaceRentalStage,
  now = new Date(),
) {
  if (!isSpaceRentalStage(nextStage)) throw new Error("알 수 없는 공간대관 단계입니다.");

  const { sheets, rows } = await readSpaceRentalSheet();
  const match = locateUniqueRow(rows, identity);
  const timestampColumn = STAGE_TIME_COLUMNS[nextStage];
  const timestamp = timestampColumn ? formatCurrentDateTime(now) : null;
  const sheetId = await getSheetId(sheets);
  const requests: object[] = [
    {
      updateCells: {
        range: rowRange(sheetId, match.rowNumber, "W", "W"),
        rows: [{ values: [{ userEnteredValue: { stringValue: nextStage } }] }],
        fields: "userEnteredValue",
      },
    },
    {
      repeatCell: {
        // X~AH는 사람이 쓰는 메모 영역이므로 행 색도 그 열에는 쓰지 않는다.
        range: rowRange(sheetId, match.rowNumber, "A", "W"),
        cell: {
          userEnteredFormat: {
            backgroundColor: nextStage === "종료" ? CLOSED_ROW_BACKGROUND : DEFAULT_ROW_BACKGROUND,
          },
        },
        fields: "userEnteredFormat.backgroundColor",
      },
    },
    {
      repeatCell: {
        range: rowRange(sheetId, match.rowNumber, "AI", "AM"),
        cell: {
          userEnteredFormat: {
            backgroundColor: nextStage === "종료" ? CLOSED_ROW_BACKGROUND : DEFAULT_ROW_BACKGROUND,
          },
        },
        fields: "userEnteredFormat.backgroundColor",
      },
    },
  ];

  if (timestampColumn && timestamp) {
    requests.push({
      updateCells: {
        range: rowRange(sheetId, match.rowNumber, timestampColumn, timestampColumn),
        rows: [{ values: [{ userEnteredValue: { stringValue: timestamp } }] }],
        fields: "userEnteredValue",
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPACE_RENTALS_SPREADSHEET_ID,
    requestBody: { requests },
  });

  return { stage: nextStage, timestamp };
}

export async function getSpaceRentalByIdentity(identity: SpaceRentalIdentity): Promise<SpaceRentalRecord> {
  const { rows } = await readSpaceRentalSheet();
  const match = locateUniqueRow(rows, identity);
  const record = parseSpaceRentalRows(rows).find((item) => item.rowNumber === match.rowNumber);
  if (!record) throw new Error("시트에서 공간대관 내용을 읽지 못했습니다.");
  return record;
}

export async function saveSpaceRentalProject(
  identity: SpaceRentalIdentity,
  projectName: string,
  projectUrl: string,
) {
  const value = projectName.trim();
  if (!value) throw new Error("프로젝트명을 입력해 주세요.");

  const { sheets, rows } = await readSpaceRentalSheet();
  const match = locateUniqueRow(rows, identity);
  const existingProjectName = match.values[37] ?? "";
  if (existingProjectName) {
    return { projectName: existingProjectName, alreadyLinked: true };
  }

  const sheetId = await getSheetId(sheets);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPACE_RENTALS_SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          updateCells: {
            range: rowRange(sheetId, match.rowNumber, PROJECT_NAME_COLUMN, PROJECT_NAME_COLUMN),
            rows: [{ values: [{ userEnteredValue: { stringValue: value } }] }],
            fields: "userEnteredValue",
          },
        },
        {
          repeatCell: {
            range: rowRange(sheetId, match.rowNumber, PROJECT_NAME_COLUMN, PROJECT_NAME_COLUMN),
            cell: { userEnteredFormat: { textFormat: { link: { uri: projectUrl } } } },
            fields: "userEnteredFormat.textFormat.link",
          },
        },
      ],
    },
  });
  return { projectName: value, alreadyLinked: false };
}

export async function appendSpaceRentalProjectRow(
  rental: SpaceRentalRecord,
  projectName: string,
  customerName: string,
): Promise<{ alreadyExists: boolean }> {
  const input: ProjectSheetRowInput = {
    submittedAt: rental.receivedAt,
    projectName,
    customerName,
    phone: rental.phone,
    email: rental.email,
    rentalType: rental.eventType,
    desiredArea: rental.venue,
    eventDate: [rental.schedule, rental.detailTime].filter(Boolean).join(" "),
    venue: rental.venue,
    rentalFee: rental.quote,
    brokerageFee: "",
    assignee: rental.assignee,
    memo: rental.content,
  };
  return appendProjectSheetRow(input);
}
