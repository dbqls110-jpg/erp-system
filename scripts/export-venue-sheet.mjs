/**
 * 공간 DB 를 구글 시트 한 장으로 내보낸다 — 항상 같은 시트, 내용만 최신.
 *
 * ERP 의 "구글 시트" 메뉴는 `천우영 시트` 폴더 안의 시트만 보여 준다. 공간 DB 는 날짜별
 * 스냅샷(xlsx)으로만 드라이브에 있어서 거기 안 떴다. 그래서 `천우영 시트 > 공간DB` 폴더에
 * 시트 하나를 두고, 재적재할 때마다 이 스크립트가 그 시트를 통째로 다시 쓴다.
 * 시트가 이미 있으면 새로 만들지 않고 덮어써서 링크가 바뀌지 않는다.
 *
 * 내용은 venues 표 기준이다(원본 CSV 가 아니라). ERP 에서만 채워지는 통화일·확인 요금·
 * 통화 메모가 앞쪽 열에 같이 나가야 "메신저로 여기는 된다/안 된다" 한 것이 시트에도 보인다.
 * 원본의 나머지 칸(raw)은 뒤에 이어 붙인다.
 *
 *   node scripts/export-venue-sheet.mjs            쓴다
 *   node scripts/export-venue-sheet.mjs --dry-run  몇 행·몇 열이 나가는지만
 */
import "dotenv/config";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getRefreshToken } from "./lib/drive.mjs";
import { isInternalRawKey } from "../src/lib/venueColumns.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
/** 운영 공간DB로 사용할 고정 Google Sheet. 새 파일을 만들거나 이름 검색으로 우회하지 않는다. */
const CANONICAL_SPREADSHEET_ID = "1XFfEdhOwFMyZE7IuDcykDaRNQ8IXtPq6bvwA-StjII4";
const TAB = "공간DB";
/** 한 번에 보내는 행 수. 157열 × 400행이면 요청 하나가 1MB 안팎이다. */
const CHUNK = 400;

// 운영 공간DB에서 더 이상 관리하지 않는 원본/검증 열이다.
// 이 목록을 export 단계에서도 걸러야 다음 전체 재내보내기 때 삭제한 열이 되살아나지 않는다.
const SHEET_OMITTED_COLUMNS = new Set([
  "근거_야외", "영리_검증일", "대여물품", "소음제한", "그늘천막", "우천시",
  "화장실_비고", "전기_비고", "대관방법_표준", "신청채널_대분류", "주차_대수",
  "빔_수량", "첨부파일경로", "요금_신뢰도", "접근제한_표준", "신청절차_표준",
  "수용_신뢰도", "통화_제한", "통화_요금", "구_요금", "구_대관방법", "구_전화",
]);

/** 앞에 두는 열: 컬럼으로 옮긴 원본 칸(적재 스크립트의 MAPPED 와 같은 이름) + ERP 통화 기록. 나머지 원본 칸은 뒤에 붙는다. */
const LEAD = [
  ["이름", (v) => v.name],
  ["자치구", (v) => v.district],
  ["위치", (v) => v.address],
  ["유형", (v) => v.type],
  ["수용_적용min", (v) => v.capacityMin],
  ["수용_적용max", (v) => v.capacityMax],
  ["관람석", (v) => v.seats],
  ["실면적", (v) => v.areaM2],
  ["대관료_4시간환산", (v) => v.price4h],
  ["요금_신뢰도", (v) => v.priceConfidence],
  ["요금_출처", (v) => v.priceSource],
  ["대관료_최소", (v) => v.priceMin],
  ["대관료_최대", (v) => v.priceMax],
  ["요금_적용", (v) => v.price],
  ["요금_적용기준", (v) => v.priceBasis],
  ["기본_시간", (v) => v.baseHours],
  ["ERP_통화일", (v) => (v.calledAt ? v.calledAt.toISOString().slice(0, 10) : null)],
  ["ERP_확인요금", (v) => v.calledPrice],
  ["ERP_통화메모", (v) => v.calledNote],
  ["대관문의_전화", (v) => v.phone],
  ["예약URL", (v) => v.reserveUrl],
  ["대관방법_표준", (v) => v.reserveMethod],
  ["영리대관", (v) => v.commercialUse],
  ["토요일", (v) => v.saturday],
  ["일요일", (v) => v.sunday],
  ["공휴일", (v) => v.holiday],
  ["평일_시작", (v) => v.weekdayOpen],
  ["평일_종료", (v) => v.weekdayClose],
  ["토요일_시작", (v) => v.satOpen],
  ["토요일_종료", (v) => v.satClose],
  ["일요일_시작", (v) => v.sunOpen],
  ["일요일_종료", (v) => v.sunClose],
  ["초과_단위", (v) => v.overUnit],
  ["초과_비율", (v) => v.overRate],
  ["초과_금액", (v) => v.overAmount],
  ["할증_주말_퍼센트", (v) => v.weekendSurcharge],
  ["부가세_구분", (v) => v.vatType],
  ["빔", (v) => v.beam],
  ["음향", (v) => v.sound],
  ["무대", (v) => v.stage],
  ["조명", (v) => v.lighting],
  ["냉난방", (v) => v.hvac],
  ["주차", (v) => v.parking],
  ["대기공간", (v) => v.waitingRoom],
  ["전기", (v) => v.electricity],
  ["화장실", (v) => v.restroom],
  ["우천시", (v) => v.rainPlan],
  ["그늘천막", (v) => v.shadeTent],
  ["취사화기", (v) => v.cooking],
  ["소음제한", (v) => v.noiseLimit],
  ["대여물품", (v) => v.rentalItems],
  ["위도", (v) => v.lat],
  ["경도", (v) => v.lng],
  ["좌표출처", (v) => v.geoSource],
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const venues = await prisma.venue.findMany({ orderBy: [{ district: "asc" }, { name: "asc" }] });
  const activeLead = LEAD.filter(([name]) => !SHEET_OMITTED_COLUMNS.has(name));
  // raw 칸 이름의 합집합. 행마다 있는 칸이 조금씩 다르다.
  const leadNames = new Set(activeLead.map(([n]) => n));
  const rawCols = [];
  const seen = new Set();
  for (const v of venues) {
    for (const k of Object.keys(v.raw ?? {})) {
      // 밑줄로 시작하는 키(_작업로그)는 DB팀 작업 이력이라 시트에 내보내지 않는다.
      if (!seen.has(k) && !leadNames.has(k) && !SHEET_OMITTED_COLUMNS.has(k) && !isInternalRawKey(k)) {
        seen.add(k);
        rawCols.push(k);
      }
    }
  }
  const header = [...activeLead.map(([n]) => n), ...rawCols];
  const cell = (x) => (x === null || x === undefined ? "" : typeof x === "object" ? JSON.stringify(x) : x);
  const rows = venues.map((v) => [...activeLead.map(([, f]) => cell(f(v))), ...rawCols.map((k) => cell(v.raw?.[k]))]);
  console.log(`공간 ${rows.length}행 × ${header.length}열 (ERP 열 ${activeLead.length} + 원본 칸 ${rawCols.length})`);
  if (DRY_RUN) { console.log("--dry-run 이라 쓰지 않습니다."); process.exit(0); }

  const oauth2 = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
  oauth2.setCredentials({ refresh_token: await getRefreshToken() });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });
  const spreadsheetId = CANONICAL_SPREADSHEET_ID;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  console.log("지정된 운영 공간DB 시트에 덮어씀");

  // 탭이 없으면(사람이 이름을 바꿨거나) 만들고, 있으면 비운다.
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  let tab = meta.data.sheets.find((s) => s.properties.title === TAB);
  if (!tab) {
    const added = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] } });
    tab = { properties: added.data.replies[0].addSheet.properties };
  }
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${TAB}'` });
  // 격자를 필요한 크기로 맞춘다. 기본 1,000행 × 26열이라 안 늘리면 쓰기가 실패한다.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ updateSheetProperties: {
      properties: { sheetId: tab.properties.sheetId, gridProperties: { rowCount: rows.length + 1, columnCount: header.length, frozenRowCount: 1 } },
      fields: "gridProperties(rowCount,columnCount,frozenRowCount)",
    } }] },
  });

  const all = [header, ...rows];
  for (let i = 0; i < all.length; i += CHUNK) {
    const part = all.slice(i, i + CHUNK);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${TAB}'!A${i + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: part },
    });
    process.stdout.write(`\r  ${Math.min(i + CHUNK, all.length)}/${all.length}`);
  }
  console.log(`\n완료: ${url}`);
} finally {
  await prisma.$disconnect();
}
