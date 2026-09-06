import { makeSheetsClientAsOwner } from "@/lib/googleClient";
import {
  findInquiryRows,
  formatCurrentDateTime,
  isInquiryStage,
  parseSheetDateTime,
  parseInquiryRows,
  shouldHideInquiry,
  type InquiryIdentity,
  type InquiryRecord,
  type InquiryStage,
} from "@/lib/inquiries";

export const INQUIRIES_SPREADSHEET_ID = "1Cy23O5gu9DLsCOy3XBRAUNwAdf8mHqMRdCmFX9-3_AM";
export const INQUIRIES_TAB_NAME = "문의 접수";
export const PROJECTS_SPREADSHEET_ID = "1d0c5IUz7du-gqwKaoOj7YmFERzoOc-P1bbqXLI9ndDw";
export const PROJECTS_TAB_NAME = "프로젝트";

const INQUIRIES_RANGE = `'${INQUIRIES_TAB_NAME}'!A1:P`;
const MEMO_COLUMN = "J";
const STAGE_TIME_COLUMNS: Partial<Record<InquiryStage, string>> = {
  "1차 연락": "K",
  "2차 연락": "L",
  "3차 연락": "M",
  "종료": "N",
  성사: "P",
};
const CLOSED_ROW_BACKGROUND = { red: 0.9, green: 0.9, blue: 0.9 };
/** 손대지 않은 행의 배경. 회색을 지울 때 이 값으로 되돌린다. */
const DEFAULT_ROW_BACKGROUND = { red: 1, green: 1, blue: 1 };
const PROJECT_HEADERS = [
  "문의 접수일시",
  "프로젝트명",
  "고객명",
  "연락처",
  "이메일",
  "대관 유형",
  "희망 지역",
  "행사일",
  "장소",
  "대관료",
  "중개 수수료",
  "진행 상태",
  "담당자",
  "생성일시",
  "비고",
];

type SheetRows = readonly (readonly unknown[])[];
type SheetsClient = Awaited<ReturnType<typeof makeSheetsClientAsOwner>>;

async function readInquirySheet() {
  const sheets = await makeSheetsClientAsOwner();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: INQUIRIES_SPREADSHEET_ID,
    range: INQUIRIES_RANGE,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  return { sheets, rows: (response.data.values ?? []) as SheetRows };
}

export async function getVisibleInquiries(now = new Date()): Promise<InquiryRecord[]> {
  return (await getInquiries()).filter((record) => !shouldHideInquiry(record, now));
}

export async function getInquiries(): Promise<InquiryRecord[]> {
  const { rows } = await readInquirySheet();
  return parseInquiryRows(rows);
}

function locateUniqueRow(rows: SheetRows, identity: InquiryIdentity) {
  const matches = findInquiryRows(rows, identity);
  if (matches.length === 0) {
    throw new Error("시트에서 문의 행을 다시 찾지 못했습니다. 시트가 수정됐을 수 있습니다.");
  }
  if (matches.length > 1) {
    throw new Error("같은 접수일시·이름·이메일·연락처의 문의가 여러 행이라 안전하게 저장하지 않았습니다.");
  }
  return matches[0];
}

function cellRange(column: string, rowNumber: number): string {
  return `'${INQUIRIES_TAB_NAME}'!${column}${rowNumber}`;
}

async function getSheetId(sheets: SheetsClient, spreadsheetId: string, tabName: string): Promise<number> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = response.data.sheets?.find((item) => item.properties?.title === tabName);
  const sheetId = sheet?.properties?.sheetId;
  if (typeof sheetId !== "number") throw new Error(`‘${tabName}’ 탭을 찾지 못했습니다.`);
  return sheetId;
}

function rowRange(sheetId: number, rowNumber: number, startColumnIndex: number, endColumnIndex: number) {
  return {
    sheetId,
    startRowIndex: rowNumber - 1,
    endRowIndex: rowNumber,
    startColumnIndex,
    endColumnIndex,
  };
}

export async function saveInquiryStage(
  identity: InquiryIdentity,
  nextStage: InquiryStage,
  now = new Date(),
) {
  if (!isInquiryStage(nextStage)) throw new Error("알 수 없는 문의 단계입니다.");

  const { sheets, rows } = await readInquirySheet();
  // 행 번호를 그대로 믿지 않고 최신 A~D 값을 재확인한다. 시트에서 행을 지운 뒤에는
  // 예전 번호가 다른 고객을 가리킬 수 있으므로, 일치 행이 하나일 때만 수정한다.
  const match = locateUniqueRow(rows, identity);
  const timestampColumn = STAGE_TIME_COLUMNS[nextStage];
  const timestamp = timestampColumn ? formatCurrentDateTime(now) : null;
  const sheetId = await getSheetId(sheets, INQUIRIES_SPREADSHEET_ID, INQUIRIES_TAB_NAME);
  const requests: object[] = [
    {
      updateCells: {
        range: rowRange(sheetId, match.rowNumber, 7, 8),
        rows: [{ values: [{ userEnteredValue: { stringValue: nextStage } }] }],
        fields: "userEnteredValue",
      },
    },
    {
      repeatCell: {
        range: rowRange(sheetId, match.rowNumber, 0, 16),
        cell: {
          userEnteredFormat: {
            // 종료 행만 회색으로 남기고 진행 단계로 돌아가면 흰색으로 되돌린다.
            //
            // 빈 객체({})를 넣으면 안 된다. 시트 API 는 빠진 색 성분을 0 으로 채우므로
            // {} 는 "색 없음" 이 아니라 검정이다. 실제로 종료에서 되돌린 행이 검게
            // 칠해졌다. 손대지 않은 행의 값이 흰색(1,1,1)이라 그 값으로 되돌린다.
            backgroundColor: nextStage === "종료" ? CLOSED_ROW_BACKGROUND : DEFAULT_ROW_BACKGROUND,
          },
        },
        fields: "userEnteredFormat.backgroundColor",
      },
    },
  ];
  if (timestampColumn && timestamp) {
    const columnIndex = timestampColumn.charCodeAt(0) - "A".charCodeAt(0);
    requests.push({
      updateCells: {
        range: rowRange(sheetId, match.rowNumber, columnIndex, columnIndex + 1),
        rows: [{ values: [{ userEnteredValue: { stringValue: timestamp } }] }],
        fields: "userEnteredValue",
      },
    });
  }

  // 상태·시각·행 색을 한 번의 batchUpdate로 묶어 일부만 저장되는 상태를 막는다.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: INQUIRIES_SPREADSHEET_ID,
    requestBody: { requests },
  });

  return { stage: nextStage, timestamp };
}

export async function saveInquiryMemo(identity: InquiryIdentity, memo: string) {
  const { sheets, rows } = await readInquirySheet();
  const match = locateUniqueRow(rows, identity);
  const value = memo.trim();
  await sheets.spreadsheets.values.update({
    spreadsheetId: INQUIRIES_SPREADSHEET_ID,
    range: cellRange(MEMO_COLUMN, match.rowNumber),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
  return { memo: value };
}

export async function getInquiryByIdentity(identity: InquiryIdentity): Promise<InquiryRecord> {
  const { rows } = await readInquirySheet();
  const match = locateUniqueRow(rows, identity);
  const record = parseInquiryRows(rows).find((item) => item.rowNumber === match.rowNumber);
  if (!record) throw new Error("시트에서 문의 내용을 읽지 못했습니다.");
  return record;
}

export async function saveInquiryProject(
  identity: InquiryIdentity,
  projectName: string,
  projectUrl: string,
) {
  const value = projectName.trim();
  if (!value) throw new Error("프로젝트명을 입력해 주세요.");

  const { sheets, rows } = await readInquirySheet();
  const match = locateUniqueRow(rows, identity);
  const existingProjectName = match.values[14] ?? "";
  if (existingProjectName) {
    // 재시도나 중복 클릭 때 이미 기록된 프로젝트를 덮어쓰지 않아 중복 생성을 막는다.
    return { projectName: existingProjectName, alreadyLinked: true };
  }

  const sheetId = await getSheetId(sheets, INQUIRIES_SPREADSHEET_ID, INQUIRIES_TAB_NAME);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: INQUIRIES_SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          updateCells: {
            range: rowRange(sheetId, match.rowNumber, 14, 15),
            rows: [{ values: [{ userEnteredValue: { stringValue: value } }] }],
            fields: "userEnteredValue",
          },
        },
        {
          repeatCell: {
            range: rowRange(sheetId, match.rowNumber, 14, 15),
            cell: { userEnteredFormat: { textFormat: { link: { uri: projectUrl } } } },
            fields: "userEnteredFormat.textFormat.link",
          },
        },
      ],
    },
  });
  return { projectName: value, alreadyLinked: false };
}

function normalizeSheetText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function safeSheetValue(value: string): string {
  // 문의 내용과 프로젝트명은 사용자가 입력하므로 시트가 값 대신 수식으로 실행하지 않게 한다.
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function sameSheetDate(left: unknown, right: string): boolean {
  const leftDate = parseSheetDateTime(String(left ?? ""));
  const rightDate = parseSheetDateTime(right);
  if (leftDate && rightDate) return leftDate.getTime() === rightDate.getTime();
  return normalizeSheetText(left) === normalizeSheetText(right);
}

function isSameProjectSheetRow(values: readonly unknown[], inquiry: InquiryRecord, projectName: string, customerName: string) {
  return (
    sameSheetDate(values[0], inquiry.submittedAt) &&
    normalizeSheetText(values[1]) === normalizeSheetText(projectName) &&
    normalizeSheetText(values[2]) === normalizeSheetText(customerName) &&
    normalizeSheetText(values[3]) === normalizeSheetText(inquiry.phone) &&
    normalizeSheetText(values[4]) === normalizeSheetText(inquiry.email)
  );
}

async function ensureProjectSheetTab(sheets: SheetsClient): Promise<void> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: PROJECTS_SPREADSHEET_ID,
    fields: "sheets.properties(sheetId,title)",
  });
  if (meta.data.sheets?.some((sheet) => sheet.properties?.title === PROJECTS_TAB_NAME)) return;

  // 고정된 프로젝트 시트에서 탭이 없어졌을 때도 다음 성사 건이 멈추지 않게 복구한다.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: PROJECTS_SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: PROJECTS_TAB_NAME } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: PROJECTS_SPREADSHEET_ID,
    range: `'${PROJECTS_TAB_NAME}'!A1:O1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [PROJECT_HEADERS] },
  });
}

export async function appendInquiryProjectRow(
  inquiry: InquiryRecord,
  projectName: string,
  customerName: string,
): Promise<{ alreadyExists: boolean }> {
  const sheets = await makeSheetsClientAsOwner();
  await ensureProjectSheetTab(sheets);

  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: PROJECTS_SPREADSHEET_ID,
    range: `'${PROJECTS_TAB_NAME}'!A1:O1`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  if (!(headerResponse.data.values?.[0] ?? []).some((value) => String(value ?? "").trim())) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: PROJECTS_SPREADSHEET_ID,
      range: `'${PROJECTS_TAB_NAME}'!A1:O1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [PROJECT_HEADERS] },
    });
  }

  const rowsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: PROJECTS_SPREADSHEET_ID,
    range: `'${PROJECTS_TAB_NAME}'!A:O`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = (rowsResponse.data.values ?? []) as SheetRows;
  if (rows.slice(1).some((values) => isSameProjectSheetRow(values, inquiry, projectName, customerName))) {
    return { alreadyExists: true };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: PROJECTS_SPREADSHEET_ID,
    range: `'${PROJECTS_TAB_NAME}'!A:O`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        safeSheetValue(inquiry.submittedAt),
        safeSheetValue(projectName),
        safeSheetValue(customerName),
        safeSheetValue(inquiry.phone),
        safeSheetValue(inquiry.email),
        safeSheetValue(inquiry.rentalType),
        safeSheetValue(inquiry.desiredArea),
        "",
        "",
        "",
        "",
        "진행 중",
        safeSheetValue(inquiry.assignee),
        safeSheetValue(formatCurrentDateTime()),
        safeSheetValue(inquiry.content),
      ]],
    },
  });
  return { alreadyExists: false };
}
