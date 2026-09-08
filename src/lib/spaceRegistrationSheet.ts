import { makeSheetsClientAsOwner } from "@/lib/googleClient";
import {
  findSpaceRegistrationRows,
  isSpaceRegistrationStage,
  parseSpaceRegistrationRows,
  type SpaceRegistrationIdentity,
  type SpaceRegistrationRecord,
  type SpaceRegistrationStage,
} from "@/lib/spaceRegistrations";
import { formatCurrentDateTime } from "@/lib/inquiries";

export const SPACE_REGISTRATIONS_SPREADSHEET_ID = "1A5xN_nii5AeAkM9JSF0morcetMCI3A7TDcvk3xRjd1M";
export const SPACE_REGISTRATIONS_TAB_NAME = "공간 등록 접수";

const SPACE_REGISTRATIONS_RANGE = `'${SPACE_REGISTRATIONS_TAB_NAME}'!A1:AB`;
const MEMO_COLUMN = "W";
const FINAL_PROCESSED_COLUMN = "X";
const STAGE_TIME_COLUMNS: Partial<Record<SpaceRegistrationStage, string>> = {
  "검토 중": "Y",
  "확인 완료": "Z",
  "등록 완료": "AA",
  반려: "AB",
};
const REJECTED_ROW_BACKGROUND = { red: 0.9, green: 0.9, blue: 0.9 };
/** 반려 행의 회색을 지울 때 검정이 되지 않도록 실제 기본 흰색을 다시 쓴다. */
const DEFAULT_ROW_BACKGROUND = { red: 1, green: 1, blue: 1 };

type SheetRows = readonly (readonly unknown[])[];
type SheetsClient = Awaited<ReturnType<typeof makeSheetsClientAsOwner>>;

async function readSpaceRegistrationSheet() {
  const sheets = await makeSheetsClientAsOwner();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    range: SPACE_REGISTRATIONS_RANGE,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  return { sheets, rows: (response.data.values ?? []) as SheetRows };
}

export async function getSpaceRegistrations(): Promise<SpaceRegistrationRecord[]> {
  const { rows } = await readSpaceRegistrationSheet();
  return parseSpaceRegistrationRows(rows);
}

function locateUniqueRow(rows: SheetRows, identity: SpaceRegistrationIdentity) {
  const matches = findSpaceRegistrationRows(rows, identity);
  if (matches.length === 0) {
    throw new Error("시트에서 공간 등록 행을 다시 찾지 못했습니다. 시트가 수정됐을 수 있습니다.");
  }
  if (matches.length > 1) {
    throw new Error("같은 접수번호 또는 여러 확인 값의 공간 등록 행이 여러 개라 안전하게 저장하지 않았습니다.");
  }
  return matches[0];
}

function cellRange(column: string, rowNumber: number): string {
  return `'${SPACE_REGISTRATIONS_TAB_NAME}'!${column}${rowNumber}`;
}

async function getSheetId(sheets: SheetsClient): Promise<number> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = response.data.sheets?.find((item) => item.properties?.title === SPACE_REGISTRATIONS_TAB_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (typeof sheetId !== "number") throw new Error(`‘${SPACE_REGISTRATIONS_TAB_NAME}’ 탭을 찾지 못했습니다.`);
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

export async function saveSpaceRegistrationStage(
  identity: SpaceRegistrationIdentity,
  nextStage: SpaceRegistrationStage,
  now = new Date(),
) {
  if (!isSpaceRegistrationStage(nextStage)) throw new Error("알 수 없는 공간 등록 단계입니다.");

  const { sheets, rows } = await readSpaceRegistrationSheet();
  // A 접수번호가 있으면 그것을 먼저 찾고, 비어 있으면 접수일시·연락처·공간명 등 여러 값을 재확인한다.
  // 최신 시트에서 일치 행이 하나일 때만 쓰므로 행 이동이나 중복 행이 다른 자료를 덮지 못한다.
  const match = locateUniqueRow(rows, identity);
  const timestamp = formatCurrentDateTime(now);
  const stageTimeColumn = STAGE_TIME_COLUMNS[nextStage];
  const sheetId = await getSheetId(sheets);
  const requests: object[] = [
    {
      updateCells: {
        range: rowRange(sheetId, match.rowNumber, "C", "C"),
        rows: [{ values: [{ userEnteredValue: { stringValue: nextStage } }] }],
        fields: "userEnteredValue",
      },
    },
    {
      updateCells: {
        range: rowRange(sheetId, match.rowNumber, FINAL_PROCESSED_COLUMN, FINAL_PROCESSED_COLUMN),
        rows: [{ values: [{ userEnteredValue: { stringValue: timestamp } }] }],
        fields: "userEnteredValue",
      },
    },
    {
      repeatCell: {
        range: rowRange(sheetId, match.rowNumber, "A", "AB"),
        cell: {
          userEnteredFormat: {
            // 반려 행만 회색으로 남기고 다른 단계로 돌아가면 손대지 않은 행의 흰색으로 복원한다.
            // 빈 객체({})는 시트 API에서 검정으로 해석되므로 사용하지 않는다.
            backgroundColor: nextStage === "반려" ? REJECTED_ROW_BACKGROUND : DEFAULT_ROW_BACKGROUND,
          },
        },
        fields: "userEnteredFormat.backgroundColor",
      },
    },
  ];

  // 접수로 되돌릴 때도 Y~AB의 과거 기록은 지우지 않고, 새 단계에 들어간 경우에만 해당 시각을 갱신한다.
  if (stageTimeColumn) {
    requests.push({
      updateCells: {
        range: rowRange(sheetId, match.rowNumber, stageTimeColumn, stageTimeColumn),
        rows: [{ values: [{ userEnteredValue: { stringValue: timestamp } }] }],
        fields: "userEnteredValue",
      },
    });
  }

  // 상태·최종 처리 시각·단계 시각·행 색을 한 번에 저장해 일부만 반영되는 상태를 막는다.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    requestBody: { requests },
  });

  return { stage: nextStage, timestamp };
}

export async function saveSpaceRegistrationMemo(identity: SpaceRegistrationIdentity, memo: string) {
  const { sheets, rows } = await readSpaceRegistrationSheet();
  const match = locateUniqueRow(rows, identity);
  const value = memo.trim();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    range: cellRange(MEMO_COLUMN, match.rowNumber),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
  return { memo: value };
}
