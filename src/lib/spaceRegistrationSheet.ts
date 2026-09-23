import { makeSheetsClientAsOwner } from "@/lib/googleClient";
import {
  findSpaceRegistrationRows,
  isSpaceRegistrationStage,
  parseSpaceRegistrationRows,
  SPACE_REGISTRATION_EXTRA_COLUMNS,
  SPACE_REGISTRATION_COLUMN_COUNT,
  type SpaceRegistrationIdentity,
  type SpaceRegistrationRecord,
  type SpaceRegistrationStage,
} from "@/lib/spaceRegistrations";
import { formatCurrentDateTime } from "@/lib/inquiries";
import { syncCompletedSpaceRegistration } from "@/lib/spaceDatabaseSync";
import { blockedReason } from "@/lib/venueBlocklist.mjs";

export const SPACE_REGISTRATIONS_SPREADSHEET_ID = "1A5xN_nii5AeAkM9JSF0morcetMCI3A7TDcvk3xRjd1M";
export const SPACE_REGISTRATIONS_TAB_NAME = "공간 등록 접수";

const SPACE_REGISTRATIONS_RANGE = `'${SPACE_REGISTRATIONS_TAB_NAME}'!A1:${columnName(SPACE_REGISTRATION_COLUMN_COUNT - 1)}`;
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

/** 절대 제외 목록은 접수 저장 전과 등록 완료 전 양쪽에서 검사한다. */
export function assertSpaceRegistrationAllowed(input: Pick<SpaceRegistrationSheetRowInput, "spaceName" | "address">) {
  const reason = blockedReason({ name: input.spaceName, address: input.address });
  if (reason) {
    throw new Error(`절대 등록 금지 공간이라 접수하지 않았습니다. (${reason})`);
  }
}

/** ERP 비서의 공간등록 제안을 접수 시트 한 행으로 바꾸는 입력값. */
export interface SpaceRegistrationSheetRowInput {
  /** 지정할 호스트 등록 공간 데이터 번호(1부터). */
  spaceNumber?: number;
  spaceName: string;
  contactName?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  spaceType?: string;
  address?: string;
  desiredRegion?: string;
  description?: string;
  area?: string | number;
  capacity?: string | number;
  dailyRate?: string | number;
  negotiable?: string;
  conditions?: string;
  photoFolderUrl?: string;
  photoCount?: number;
  privacyConsentAt?: string;
  photoPermission?: string;
  cooling?: string;
  restroom?: string;
  wifi?: string;
  parkingCount?: string | number;
  fireNotAllowed?: string;
  drillingNotAllowed?: string;
  noiseLimit?: string;
  equipmentRental?: string;
  nightWork?: string;
  foodAllowed?: string;
  extraConditions?: string;
  areaPyeong?: string | number;
  rentableFloors?: string;
  rentableTotalArea?: string | number;
  rentableFloorArea?: string;
  outdoorYard?: string;
  kitchen?: string;
  usage?: string;
  storageOffice?: string;
  roomCount?: string | number;
  powerCapacity?: string;
  elevator?: string;
  freightElevator?: string;
  ooh?: string;
  wasteDisposal?: string;
  drilling?: string;
  accessHours?: string;
  parkingAvailable?: string;
  parkingSpaces?: string | number;
  floorPlan?: string;
  ceilingHeight?: string;
  lighting?: string;
  wiredInternet?: string;
  floorFinish?: string;
  deposit?: string | number;
  managementFee?: string | number;
  tourMethod?: string;
  weekdayRate?: string | number;
  weekendHolidayRate?: string | number;
  minimumRentalDays?: string | number;
  vatIncluded?: string;
  receivedAt?: Date;
}

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

/** 새 상세 열이 없는 기존 접수 탭에도 헤더와 그리드를 안전하게 확장한다. */
async function ensureSpaceRegistrationHeaders(sheets: SheetsClient, rows: SheetRows) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    fields: "sheets.properties(sheetId,title,gridProperties(columnCount))",
  });
  const sheet = response.data.sheets?.find((item) => item.properties?.title === SPACE_REGISTRATIONS_TAB_NAME);
  const sheetId = sheet?.properties?.sheetId;
  const currentColumnCount = sheet?.properties?.gridProperties?.columnCount;
  if (typeof sheetId !== "number" || typeof currentColumnCount !== "number") {
    throw new Error(`‘${SPACE_REGISTRATIONS_TAB_NAME}’ 탭의 열 구조를 읽지 못했습니다.`);
  }
  const requests: object[] = [];
  if (currentColumnCount < SPACE_REGISTRATION_COLUMN_COUNT) {
    requests.push({
      appendDimension: {
        sheetId,
        dimension: "COLUMNS",
        length: SPACE_REGISTRATION_COLUMN_COUNT - currentColumnCount,
      },
    });
  }
  const currentHeaders = rows[0] ?? [];
  SPACE_REGISTRATION_EXTRA_COLUMNS.forEach(({ header }, index) => {
    const column = 39 + index;
    if (String(currentHeaders[column] ?? "").trim()) return;
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: column,
          endColumnIndex: column + 1,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: header } }] }],
        fields: "userEnteredValue",
      },
    });
  });
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
      requestBody: { requests },
    });
  }
}

function sheetCellValue(value: unknown): { userEnteredValue: { stringValue: string } | { numberValue: number } } {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { userEnteredValue: { numberValue: value } };
  }
  if (typeof value === "string" && value.trim() !== "" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return { userEnteredValue: { numberValue: Number(value.trim()) } };
  }
  return { userEnteredValue: { stringValue: String(value ?? "") } };
}

function nextRegistrationId(rows: SheetRows): string {
  const max = rows.slice(1).reduce((highest, row) => {
    const value = Number(String(row[0] ?? "").replace(/[^0-9]/g, ""));
    return Number.isSafeInteger(value) ? Math.max(highest, value) : highest;
  }, 0);
  return String(max + 1);
}

function registrationRowValues(input: SpaceRegistrationSheetRowInput, registrationId: string): unknown[] {
  const now = input.receivedAt ?? new Date();
  const baseValues = [
    registrationId,
    formatCurrentDateTime(now),
    "신규",
    input.contactName,
    input.relationship,
    input.phone,
    input.email,
    input.spaceName,
    input.spaceType,
    input.address,
    input.desiredRegion,
    input.description,
    input.area,
    input.capacity,
    input.dailyRate,
    input.negotiable,
    input.conditions,
    input.photoFolderUrl,
    input.photoCount,
    input.privacyConsentAt,
    input.photoPermission,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    input.cooling,
    input.restroom,
    input.wifi,
    input.parkingCount,
    input.fireNotAllowed,
    input.drillingNotAllowed,
    input.noiseLimit,
    input.equipmentRental,
    input.nightWork,
    input.foodAllowed,
    input.extraConditions,
  ];
  return [
    ...baseValues,
    ...SPACE_REGISTRATION_EXTRA_COLUMNS.map(({ key }) => input[key]),
  ];
}

/** 공간 등록 접수 탭에 새 행을 추가한다. 기존 행의 형식·드롭다운을 복사한 뒤 값만 쓴다. */
export async function appendSpaceRegistrationRow(input: SpaceRegistrationSheetRowInput) {
  const spaceName = input.spaceName.trim();
  if (!spaceName) throw new Error("공간명이 필요합니다.");
  assertSpaceRegistrationAllowed({ spaceName, address: input.address });

  const { sheets, rows } = await readSpaceRegistrationSheet();
  await ensureSpaceRegistrationHeaders(sheets, rows);
  const registrationId = nextRegistrationId(rows);
  const rowNumber = Math.max(rows.length + 1, 2);
  const sourceRowNumber = rows.length >= 2 ? rows.length : 1;
  const sheetId = await getSheetId(sheets);
  const values = registrationRowValues({ ...input, spaceName }, registrationId);
  const requests: object[] = [
    {
      copyPaste: {
        source: rowRange(sheetId, sourceRowNumber, "A", columnName(SPACE_REGISTRATION_COLUMN_COUNT - 1)),
        destination: rowRange(sheetId, rowNumber, "A", columnName(SPACE_REGISTRATION_COLUMN_COUNT - 1)),
        pasteType: "PASTE_NORMAL",
      },
    },
    {
      updateCells: {
        range: rowRange(sheetId, rowNumber, "A", columnName(SPACE_REGISTRATION_COLUMN_COUNT - 1)),
        rows: [{ values: values.map(sheetCellValue) }],
        fields: "userEnteredValue",
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    requestBody: { requests },
  });

  const verify = await sheets.spreadsheets.values.get({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    range: `'${SPACE_REGISTRATIONS_TAB_NAME}'!A${rowNumber}:S${rowNumber}`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const saved = verify.data.values?.[0] ?? [];
  if (String(saved[0] ?? "") !== registrationId || String(saved[7] ?? "") !== spaceName) {
    throw new Error("공간 등록 접수 행 저장 후 확인에 실패했습니다.");
  }

  return { registrationId, rowNumber, spaceName, receivedAt: String(saved[1] ?? "") };
}

function columnIndex(column: string): number {
  return [...column].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
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

async function deleteSpaceRegistrationRow(sheets: SheetsClient, sheetId: number, rowNumber: number) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPACE_REGISTRATIONS_SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      }],
    },
  });
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
  const matchedRecord = parseSpaceRegistrationRows(rows).find((record) => record.rowNumber === match.rowNumber);
  if (!matchedRecord) throw new Error("공간 등록 행의 상세값을 읽지 못했습니다.");
  if (nextStage === "등록 완료") assertSpaceRegistrationAllowed(matchedRecord);
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

  // 등록 완료 시 접수 탭 → 호스트 등록 공간 → 운영 공간DB를 같은 요청에서 idempotent하게 맞춘다.
  // 시트 반영이 먼저 끝난 뒤 동기화가 실패하면 다음 재시도에서 같은 접수번호를 안전하게 upsert한다.
  const spaceDatabaseSync = nextStage === "등록 완료"
    ? await syncCompletedSpaceRegistration({ ...matchedRecord, status: nextStage }, now)
    : null;

  // 완료본이 호스트 등록 공간·공간DB에 모두 확인된 뒤 접수 행을 제거한다.
  // 동기화가 실패하면 여기까지 오지 않으므로 원본 접수 자료가 남아 재시도할 수 있다.
  if (nextStage === "등록 완료") {
    await deleteSpaceRegistrationRow(sheets, sheetId, match.rowNumber);
  }

  return {
    stage: nextStage,
    timestamp,
    ...(spaceDatabaseSync ? { spaceDatabaseSync } : {}),
    ...(nextStage === "등록 완료" ? { deleted: true } : {}),
  };
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
