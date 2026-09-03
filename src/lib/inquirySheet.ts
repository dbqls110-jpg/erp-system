import { makeSheetsClientAsOwner } from "@/lib/googleClient";
import {
  findInquiryRows,
  formatCurrentDateTime,
  isInquiryStage,
  parseInquiryRows,
  shouldHideInquiry,
  type InquiryIdentity,
  type InquiryRecord,
  type InquiryStage,
} from "@/lib/inquiries";

export const INQUIRIES_SPREADSHEET_ID = "1Cy23O5gu9DLsCOy3XBRAUNwAdf8mHqMRdCmFX9-3_AM";
export const INQUIRIES_TAB_NAME = "문의 접수";

const INQUIRIES_RANGE = `'${INQUIRIES_TAB_NAME}'!A1:N`;
const STATUS_COLUMN = "H";
const MEMO_COLUMN = "J";
const STAGE_TIME_COLUMNS: Partial<Record<InquiryStage, string>> = {
  "1차 연락": "K",
  "2차 연락": "L",
  "3차 연락": "M",
  "종료": "N",
};

type SheetRows = readonly (readonly unknown[])[];

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
  const { rows } = await readInquirySheet();
  return parseInquiryRows(rows).filter((record) => !shouldHideInquiry(record, now));
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
  const updates: { range: string; values: string[][] }[] = [
    { range: cellRange(STATUS_COLUMN, match.rowNumber), values: [[nextStage]] },
  ];
  const timestampColumn = STAGE_TIME_COLUMNS[nextStage];
  const timestamp = timestampColumn ? formatCurrentDateTime(now) : null;
  if (timestampColumn && timestamp) {
    updates.push({ range: cellRange(timestampColumn, match.rowNumber), values: [[timestamp]] });
  }

  // 이전 연락 시각은 사실 기록이므로 뒤 단계로 되돌려도 지우지 않고, 새 단계 값만 쓴다.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: INQUIRIES_SPREADSHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
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
