import { makeSheetsClientAsOwner } from "@/lib/googleClient";
import { formatCurrentDateTime } from "@/lib/inquiries";
import { SPACE_REGISTRATION_EXTRA_COLUMNS, type SpaceRegistrationRecord } from "@/lib/spaceRegistrations";
import { blockedReason } from "@/lib/venueBlocklist.mjs";

export const HOST_REGISTERED_SPACES_TAB_NAME = "호스트 등록 공간";
export const SPACE_DATABASE_SPREADSHEET_ID = "1XFfEdhOwFMyZE7IuDcykDaRNQ8IXtPq6bvwA-StjII4";
export const SPACE_DATABASE_TAB_NAME = "공간DB";
const SPACE_REGISTRATION_SPREADSHEET_ID = "1A5xN_nii5AeAkM9JSF0morcetMCI3A7TDcvk3xRjd1M";
// 접수 탭은 원문 열을 보존하지만, 완료본(호스트 등록 공간)은 세부 시설값을
// 비고 한 칸으로 묶어 운영자가 읽기 쉽게 유지한다. 원본 접수 탭의 열은
// 건드리지 않으므로 접수 파싱 순서도 바뀌지 않는다.
const HOST_REGISTERED_BASE_HEADERS = [
  "등록번호", "등록일시 (한국시간)", "등록 상태", "공간명", "지역", "공간 유형", "상세 주소",
  "담당자 이름", "연락처", "이메일", "공간과의 관계", "면적 (㎡)", "수용 인원 (명)",
  "1일 대관료 (만원)", "요금 협의", "공간 소개", "시설·대관 조건 원문", "사진 수",
  "사진 링크 (Drive 권한 필요)", "공개 공간 ID", "공간 페이지", "검토일시", "반려 사유",
  "최종 수정일시", "정보 사실 확인", "24시간 응답 동의", "90일 점검 동의", "직거래 금지 동의",
  "운영 동의일시", "냉난방", "화장실", "Wi-Fi", "주차 가능 대수", "화기 불가",
  "소음 제한", "집기 렌탈", "야간 작업", "음식 섭취 가능", "추가 조건",
] as const;
const HOST_REGISTERED_NOTE_KEYS = new Set([
  "outdoorYard", "kitchen", "usage", "storageOffice", "roomCount", "freightElevator",
  "wasteDisposal", "drilling", "accessHours", "wiredInternet", "floorFinish", "managementFee", "tourMethod",
]);
// 호스트 등록 공간은 주차 대수와 타공 여부를 각각 한 칸으로 정리한다.
const HOST_REGISTERED_EXTRA_COLUMNS = SPACE_REGISTRATION_EXTRA_COLUMNS.filter(
  ({ key }) => key !== "drilling" && key !== "parkingSpaces" && !HOST_REGISTERED_NOTE_KEYS.has(key),
);
const HOST_REGISTERED_HEADERS = [
  ...HOST_REGISTERED_BASE_HEADERS,
  ...HOST_REGISTERED_EXTRA_COLUMNS.map(({ header }) => header),
  "비고",
];
// 운영 공간DB는 원본 `전체` 탭의 121열을 기본으로 하되, 호스트 상세 열은
// 등록 완료 시 헤더를 보존하면서 오른쪽에 자동으로 확장한다.
const SPACE_DATABASE_MIN_COLUMN_COUNT = 121;
const SPACE_DATABASE_REQUIRED_COLUMNS = [
  "공간명",
  "상세 주소",
  "대관 규모(평)",
  "대관 가능 층수",
  "대관 가능 총 면적",
  "대관 가능 층별 면적",
  "전력량",
  "E/V",
  "OOH",
  "주차 유무",
  "주차 댓수",
  "도면",
  "층고",
  "냉난방",
  "조명",
  "wifi",
  "화장실",
  "보증금",
  "대관료",
  "담당자 연락처",
  "대기공간",
  "평일 대관료",
  "주말·공휴일 대관료",
  "최소 대관일",
  "VAT 여부",
  "비고",
] as const;
const HOST_SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SPACE_REGISTRATION_SPREADSHEET_ID}/edit?gid=698680621#gid=698680621`;

type SheetRows = readonly (readonly unknown[])[];
type SheetsClient = Awaited<ReturnType<typeof makeSheetsClientAsOwner>>;

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

function cellValue(value: unknown): { userEnteredValue: { stringValue: string } | { numberValue: number } } {
  if (typeof value === "number" && Number.isFinite(value)) return { userEnteredValue: { numberValue: value } };
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return { userEnteredValue: { numberValue: Number(value.trim()) } };
  }
  return { userEnteredValue: { stringValue: String(value ?? "") } };
}

async function getSheetId(sheets: SheetsClient, spreadsheetId: string, title: string): Promise<number> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = response.data.sheets?.find((item) => item.properties?.title === title);
  const sheetId = sheet?.properties?.sheetId;
  if (typeof sheetId !== "number") throw new Error(`‘${title}’ 탭을 찾지 못했습니다.`);
  return sheetId;
}

async function getSheetGridProperties(sheets: SheetsClient, spreadsheetId: string, title: string) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))",
  });
  const sheet = response.data.sheets?.find((item) => item.properties?.title === title);
  const sheetId = sheet?.properties?.sheetId;
  const columnCount = sheet?.properties?.gridProperties?.columnCount;
  if (typeof sheetId !== "number" || typeof columnCount !== "number") {
    throw new Error(`‘${title}’ 탭의 열 구조를 읽지 못했습니다.`);
  }
  return { sheetId, columnCount };
}

/** 호스트 등록 완료본에 필요한 열만 보장한다. 접수 원본의 세부 열은 다시 만들지 않는다. */
async function ensureHostRegisteredHeaders(sheets: SheetsClient) {
  const grid = await getSheetGridProperties(sheets, SPACE_REGISTRATION_SPREADSHEET_ID, HOST_REGISTERED_SPACES_TAB_NAME);
  const headers = await readValues(
    sheets,
    SPACE_REGISTRATION_SPREADSHEET_ID,
    `'${HOST_REGISTERED_SPACES_TAB_NAME}'!A1:${columnName(Math.max(grid.columnCount, HOST_REGISTERED_HEADERS.length) - 1)}`,
  );
  const currentHeaders = headers[0] ?? [];
  const requests: Array<Record<string, unknown>> = [];
  const existingHeaders = new Set(currentHeaders.map((header) => String(header ?? "").trim()).filter(Boolean));
  let nextColumn = grid.columnCount;
  for (const header of HOST_REGISTERED_HEADERS) {
    if (existingHeaders.has(header)) continue;
    requests.push({
      appendDimension: {
        sheetId: grid.sheetId,
        dimension: "COLUMNS",
        length: 1,
      },
    });
    requests.push({
      updateCells: {
        range: {
          sheetId: grid.sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: nextColumn,
          endColumnIndex: nextColumn + 1,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: header } }] }],
        fields: "userEnteredValue",
      },
    });
    existingHeaders.add(header);
    nextColumn += 1;
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPACE_REGISTRATION_SPREADSHEET_ID,
      requestBody: { requests },
    });
  }
}

async function readValues(sheets: SheetsClient, spreadsheetId: string, range: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  return (response.data.values ?? []) as SheetRows;
}

function parsedNumber(value: string): number | null {
  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parsedNumberRange(value: string): { min: number | null; max: number | null } {
  const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (numbers.length === 0) return { min: null, max: null };
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}

const SPACE_DETAIL_NOTE_FIELDS: ReadonlyArray<readonly [string, keyof SpaceRegistrationRecord]> = [
  ["야외마당", "outdoorYard"],
  ["주방", "kitchen"],
  ["용도", "usage"],
  ["창고/운영사무국", "storageOffice"],
  ["룸 개수", "roomCount"],
  ["화물승강기", "freightElevator"],
  ["쓰레기 불출", "wasteDisposal"],
  ["타공 여부", "drilling"],
  ["개방/시간방법", "accessHours"],
  ["인터넷 선", "wiredInternet"],
  ["바닥마감", "floorFinish"],
  ["관리비", "managementFee"],
  ["답사 방법", "tourMethod"],
];

function spaceDetailNotes(record: SpaceRegistrationRecord, existing = ""): string {
  const lines = existing.trim() ? [existing.trim()] : [];
  if (!lines.some((line) => line.startsWith("등록출처:"))) lines.push("등록출처: 호스트 등록");
  for (const [label, key] of SPACE_DETAIL_NOTE_FIELDS) {
    const value = String(record[key] ?? "").trim();
    if (value && !lines.some((line) => line.startsWith(`${label}:`))) lines.push(`${label}: ${value}`);
  }
  return lines.join("\n");
}

async function ensureSpaceDatabaseSchema(sheets: SheetsClient) {
  const grid = await getSheetGridProperties(sheets, SPACE_DATABASE_SPREADSHEET_ID, SPACE_DATABASE_TAB_NAME);
  const baseColumnCount = Math.max(grid.columnCount, SPACE_DATABASE_MIN_COLUMN_COUNT);
  const baseRange = `'${SPACE_DATABASE_TAB_NAME}'!A1:${columnName(baseColumnCount - 1)}`;
  const currentRows = await readValues(sheets, SPACE_DATABASE_SPREADSHEET_ID, baseRange);
  const currentHeaders = Array.from({ length: baseColumnCount }, (_, index) => String(currentRows[0]?.[index] ?? "").trim());
  const existingHeaders = new Set(currentHeaders.filter(Boolean));
  const missingHeaders = SPACE_DATABASE_REQUIRED_COLUMNS.filter((header) => !existingHeaders.has(header));

  if (grid.columnCount < SPACE_DATABASE_MIN_COLUMN_COUNT || missingHeaders.length > 0) {
    const startColumnIndex = Math.max(grid.columnCount, SPACE_DATABASE_MIN_COLUMN_COUNT);
    const appendCount = Math.max(0, SPACE_DATABASE_MIN_COLUMN_COUNT - grid.columnCount) + missingHeaders.length;
    const headerStartIndex = startColumnIndex;
    const headerEndIndex = headerStartIndex + missingHeaders.length;
    const requests: Array<Record<string, unknown>> = [];
    if (appendCount > 0) {
      requests.push({
        appendDimension: {
          sheetId: grid.sheetId,
          dimension: "COLUMNS",
          length: appendCount,
        },
      });
    }
    if (missingHeaders.length > 0) {
      requests.push({
        copyPaste: {
          source: {
            sheetId: grid.sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: Math.max(grid.columnCount - 1, 0),
            endColumnIndex: Math.max(grid.columnCount, 1),
          },
          destination: {
            sheetId: grid.sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: headerStartIndex,
            endColumnIndex: headerEndIndex,
          },
          pasteType: "PASTE_FORMAT",
        },
      });
      requests.push({
        updateCells: {
          range: {
            sheetId: grid.sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: headerStartIndex,
            endColumnIndex: headerEndIndex,
          },
          rows: [{ values: missingHeaders.map((header) => ({ userEnteredValue: { stringValue: header } })) }],
          fields: "userEnteredValue",
        },
      });
    }
    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPACE_DATABASE_SPREADSHEET_ID,
        requestBody: { requests },
      });
    }
  }

  const finalColumnCount = baseColumnCount + missingHeaders.length;
  const finalRange = `'${SPACE_DATABASE_TAB_NAME}'!A1:${columnName(finalColumnCount - 1)}`;
  const rows = await readValues(sheets, SPACE_DATABASE_SPREADSHEET_ID, finalRange);
  const headers = Array.from({ length: finalColumnCount }, (_, index) => String(rows[0]?.[index] ?? ""));
  if (!headers.some((header) => header.trim())) throw new Error("공간DB 헤더를 읽지 못했습니다.");
  return { sheetId: grid.sheetId, rows, headers, endColumn: columnName(finalColumnCount - 1) };
}

function hostRowValues(
  record: SpaceRegistrationRecord,
  timestamp: string,
  headers: readonly string[],
  existing?: readonly unknown[],
): unknown[] {
  const row = Array.from({ length: Math.max(headers.length, existing?.length ?? 0) }, (_, index) => existing?.[index]);
  const headerIndexes = new Map<string, number[]>();
  headers.forEach((header, index) => {
    const key = header.trim();
    if (!key) return;
    headerIndexes.set(key, [...(headerIndexes.get(key) ?? []), index]);
  });
  const set = (header: string, value: unknown) => {
    for (const index of headerIndexes.get(header) ?? []) row[index] = value;
  };
  set("등록번호", record.registrationId);
  set("등록일시 (한국시간)", record.receivedAt);
  set("등록 상태", "등록 완료");
  set("공간명", record.spaceName);
  set("지역", record.desiredRegion);
  set("공간 유형", record.spaceType);
  set("상세 주소", record.address);
  set("담당자 이름", record.contactName);
  set("연락처", record.phone);
  set("이메일", record.email);
  set("공간과의 관계", record.relationship);
  set("면적 (㎡)", record.area);
  set("수용 인원 (명)", record.capacity);
  set("1일 대관료 (만원)", record.dailyRate);
  set("요금 협의", record.negotiable);
  set("공간 소개", record.description);
  set("시설·대관 조건 원문", record.conditions);
  set("사진 수", record.photoCount);
  set("사진 링크 (Drive 권한 필요)", record.photoFolderUrl);
  set("검토일시", timestamp);
  set("최종 수정일시", timestamp);
  set("냉난방", record.cooling);
  set("화장실", record.restroom);
  set("Wi-Fi", record.wifi);
  set("주차 가능 대수", record.parkingCount);
  set("화기 불가", record.fireNotAllowed);
  set("소음 제한", record.noiseLimit);
  set("집기 렌탈", record.equipmentRental);
  set("야간 작업", record.nightWork);
  set("음식 섭취 가능", record.foodAllowed);
  set("추가 조건", record.extraConditions);
  for (const { key, header } of HOST_REGISTERED_EXTRA_COLUMNS) set(header, record[key]);
  const existingNote = String(row[headerIndexes.get("비고")?.[0] ?? -1] ?? "");
  set("비고", spaceDetailNotes(record, existingNote));
  return row;
}

async function writeNativeRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  sheetId: number,
  rowNumber: number,
  sourceRowNumber: number,
  startColumn: string,
  endColumn: string,
  values: unknown[],
) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: rowRange(sheetId, sourceRowNumber, startColumn, endColumn),
            destination: rowRange(sheetId, rowNumber, startColumn, endColumn),
            pasteType: "PASTE_NORMAL",
          },
        },
        {
          updateCells: {
            range: rowRange(sheetId, rowNumber, startColumn, endColumn),
            rows: [{ values: values.map(cellValue) }],
            fields: "userEnteredValue",
          },
        },
      ],
    },
  });
}

async function upsertHostRegisteredSpace(
  sheets: SheetsClient,
  record: SpaceRegistrationRecord,
  timestamp: string,
) {
  await ensureHostRegisteredHeaders(sheets);
  const grid = await getSheetGridProperties(sheets, SPACE_REGISTRATION_SPREADSHEET_ID, HOST_REGISTERED_SPACES_TAB_NAME);
  const range = `'${HOST_REGISTERED_SPACES_TAB_NAME}'!A1:${columnName(grid.columnCount - 1)}`;
  const rows = await readValues(sheets, SPACE_REGISTRATION_SPREADSHEET_ID, range);
  const headers = (rows[0] ?? []).map((header) => String(header ?? "").trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const registrationIdIndex = headerIndex.get("등록번호") ?? 0;
  const spaceNameIndex = headerIndex.get("공간명") ?? 3;
  const addressIndex = headerIndex.get("상세 주소") ?? 6;
  const existingIndex = rows.slice(1).findIndex((row) => {
    const sameId = String(row[registrationIdIndex] ?? "").trim() === record.registrationId.trim() && record.registrationId.trim() !== "";
    const sameNameAndAddress = String(row[spaceNameIndex] ?? "").trim() === record.spaceName.trim() && String(row[addressIndex] ?? "").trim() === record.address.trim();
    return sameId || (record.address.trim() && sameNameAndAddress);
  });
  const rowNumber = existingIndex >= 0 ? existingIndex + 2 : Math.max(rows.length + 1, 2);
  const sourceRowNumber = rows.length >= 2 ? rows.length : 1;
  const sheetId = await getSheetId(sheets, SPACE_REGISTRATION_SPREADSHEET_ID, HOST_REGISTERED_SPACES_TAB_NAME);
  const existingValues = existingIndex >= 0 ? rows[existingIndex + 1] : undefined;
  await writeNativeRow(
    sheets,
    SPACE_REGISTRATION_SPREADSHEET_ID,
    sheetId,
    rowNumber,
    sourceRowNumber,
    "A",
    columnName(headers.length - 1),
    hostRowValues(record, timestamp, headers, existingValues),
  );
  return { rowNumber, registrationId: record.registrationId };
}

function venueRowValues(headers: string[], rows: SheetRows, record: SpaceRegistrationRecord, timestamp: string): { rowNumber: number; values: unknown[] } {
  const headerIndex = new Map<string, number[]>();
  headers.forEach((header, index) => {
    const key = header.trim();
    if (!key) return;
    const indexes = headerIndex.get(key) ?? [];
    indexes.push(index);
    headerIndex.set(key, indexes);
  });
  const existingCandidates = rows.slice(1).flatMap((row, index) => {
    const name = String(row[headerIndex.get("이름")?.[0] ?? -1] ?? "").trim();
    const address = String(row[headerIndex.get("위치")?.[0] ?? -1] ?? "").trim();
    if (name !== record.spaceName.trim()) return [];
    if (record.address.trim() && address && address !== record.address.trim()) return [];
    return [{ row, rowNumber: index + 2 }];
  });
  if (existingCandidates.length > 1) {
    throw new Error(`공간DB에서 ‘${record.spaceName}’과 일치하는 행이 여러 개라 자동 반영을 중단했습니다.`);
  }
  const rowNumber = existingCandidates[0]?.rowNumber ?? Math.max(rows.length + 1, 2);
  // 새 공간은 직전 공간의 미매핑 값을 물려받지 않도록 빈 행에서 시작한다.
  // writeNativeRow가 직전 행의 서식만 복사한 뒤 이 배열로 전체 값을 덮어쓴다.
  const sourceValues = existingCandidates[0]?.row;
  const values = Array.from({ length: headers.length }, (_, index) => sourceValues?.[index]);
  const set = (header: string, value: unknown) => {
    for (const index of headerIndex.get(header) ?? []) values[index] = value;
  };
  const capacityRange = parsedNumberRange(record.capacity);
  const capacity = capacityRange.min;
  const capacityMax = capacityRange.max;
  const area = parsedNumber(record.area);
  const dailyRateMan = parsedNumber(record.dailyRate);
  const dailyRateWon = dailyRateMan === null ? null : dailyRateMan * 10000;
  const weekdayRateMan = parsedNumber(record.weekdayRate);
  const weekdayRateWon = weekdayRateMan === null ? null : weekdayRateMan * 10000;
  const weekendHolidayRateMan = parsedNumber(record.weekendHolidayRate);
  const weekendHolidayRateWon = weekendHolidayRateMan === null ? null : weekendHolidayRateMan * 10000;
  const minimumRentalDays = parsedNumber(record.minimumRentalDays);
  set("이름", record.spaceName);
  set("공간명", record.spaceName);
  set("대표공간명", record.spaceName);
  set("자치구", record.desiredRegion);
  set("위치", record.address);
  set("유형", record.spaceType);
  set("수용_적용min", capacity);
  set("수용_적용max", capacityMax);
  set("수용_min", capacity);
  set("수용_max", capacityMax);
  set("실면적", area);
  set("대관료_최소", dailyRateWon);
  set("대관료_최대", dailyRateWon);
  set("요금_적용", dailyRateWon);
  set("요금_신뢰도", "호스트 제공");
  set("요금_출처", "호스트 등록 공간");
  set("요금_적용기준", "호스트 등록 1일 대관료");
  set("대관문의_전화", record.phone);
  set("ERP_통화메모", record.conditions);
  set("대관방법_표준", "호스트 확인 필요");
  set("냉난방", record.cooling);
  set("화장실", record.restroom);
  set("상세 주소", record.address);
  set("담당자 연락처", record.phone);
  set("대관료", dailyRateWon);
  set("wifi", record.wifi);
  set("WiFi", record.wifi);
  set("Wi-Fi", record.wifi);
  set("와이파이", record.wifi);
  set("주차", record.parkingCount);
  set("주차_대수", record.parkingCount);
  set("주차 가능 대수", record.parkingCount);
  set("취사화기", record.fireNotAllowed);
  set("화기 불가", record.fireNotAllowed);
  set("타공 불가", record.drillingNotAllowed);
  set("야간 작업", record.nightWork);
  set("음식 섭취", record.foodAllowed);
  set("음식 섭취 가능", record.foodAllowed);
  set("소음제한", record.noiseLimit);
  set("대여물품", record.equipmentRental);
  set("추가 조건", record.extraConditions);
  set("추가조건", record.extraConditions);
  set("대관료_근거", record.conditions);
  set("대관료_상업", dailyRateWon);
  set("대관료_조건", record.conditions);
  set("수용_근거", "호스트 등록 공간");
  set("근거출처", "호스트 등록 공간");
  set("검토메모", `호스트 등록 공간 자동 반영 · 접수번호 ${record.registrationId}`);
  set("최종확인일", timestamp);
  set("조건_근거", record.conditions);
  set("첨부파일경로", record.photoFolderUrl);
  set("출처URL", HOST_SOURCE_URL);
  set("수용_적용출처", "호스트 등록 공간");
  set("요금계산_근거", "호스트 등록 1일 대관료");
  const extraValues: Record<string, unknown> = {
    "대관 규모(평)": record.areaPyeong,
    "대관 가능 층수": record.rentableFloors,
    "대관 가능 총 면적": record.rentableTotalArea,
    "대관 가능 층별 면적": record.rentableFloorArea,
    전력량: record.powerCapacity,
    "E/V": record.elevator,
    OOH: record.ooh,
    "주차 유무": record.parkingAvailable,
    "주차 댓수": record.parkingSpaces ?? record.parkingCount,
    도면: record.floorPlan,
    층고: record.ceilingHeight,
    조명: record.lighting,
    보증금: record.deposit,
    "평일 대관료": weekdayRateWon,
    "주말·공휴일 대관료": weekendHolidayRateWon,
    "최소 대관일": minimumRentalDays,
    "VAT 여부": record.vatIncluded,
  };
  for (const [header, value] of Object.entries(extraValues)) set(header, value);
  const existingNotes = String(values[headerIndex.get("비고")?.[0] ?? -1] ?? "");
  set("비고", spaceDetailNotes(record, existingNotes));
  return { rowNumber, values };
}

/** 호스트 등록 공간의 등록 완료 행을 공간DB에 idempotent하게 반영한다. */
export async function syncCompletedSpaceRegistration(record: SpaceRegistrationRecord, now = new Date()) {
  if (record.status !== "등록 완료") throw new Error("등록 완료 상태의 공간만 공간DB로 보낼 수 있습니다.");
  const blocked = blockedReason({ name: record.spaceName, address: record.address });
  if (blocked) throw new Error(`절대 등록 금지 공간이라 공간DB에 반영하지 않았습니다. (${blocked})`);
  const sheets = await makeSheetsClientAsOwner();
  const timestamp = formatCurrentDateTime(now);
  const host = await upsertHostRegisteredSpace(sheets, record, timestamp);
  const schema = await ensureSpaceDatabaseSchema(sheets);
  const { rows, headers, sheetId: venueSheetId, endColumn } = schema;
  const venue = venueRowValues(headers, rows, record, timestamp);
  const sourceRowNumber = rows.length >= 2 ? rows.length : 1;
  await writeNativeRow(sheets, SPACE_DATABASE_SPREADSHEET_ID, venueSheetId, venue.rowNumber, sourceRowNumber, "A", endColumn, venue.values);
  const verify = await sheets.spreadsheets.values.get({
    spreadsheetId: SPACE_DATABASE_SPREADSHEET_ID,
    range: `'${SPACE_DATABASE_TAB_NAME}'!A${venue.rowNumber}:C${venue.rowNumber}`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const saved = verify.data.values?.[0] ?? [];
  if (String(saved[0] ?? "") !== record.spaceName) throw new Error("공간DB 자동 반영 후 공간명 확인에 실패했습니다.");
  return { hostRowNumber: host.rowNumber, venueRowNumber: venue.rowNumber, timestamp };
}
