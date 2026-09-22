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
import { getRefreshToken, findOrCreateFolder } from "./lib/drive.mjs";
import { isInternalRawKey } from "../src/lib/venueColumns.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
/** `천우영 시트` 폴더. sync-drive-sheets.mjs 와 같은 값. */
const SHEETS_FOLDER_ID = "1sINhEgqROuCDybbvD5PbnpWaVH8V0mi_";
const SUBFOLDER = "공간DB";
const SHEET_TITLE = "서울경기_대관공간_DB";
const TAB = "공간DB";
/** 한 번에 보내는 행 수. 157열 × 400행이면 요청 하나가 1MB 안팎이다. */
const CHUNK = 400;

/** 앞에 두는 열: 컬럼으로 옮긴 원본 칸(적재 스크립트의 MAPPED 와 같은 이름) + ERP 통화 기록. 나머지 원본 칸은 뒤에 붙는다. */
const has = (x) => x !== null && x !== undefined && String(x).trim() !== "";
const won = (n) => (Number(n) === 0 ? "무료" : `${Number(n).toLocaleString()}원`);
const pct = (x) => { const v = String(x ?? "").replace(/%$/, "").trim(); if (!v) return ""; return /^[0-9.]+$/.test(v) ? `${v}%` : v; };
/** W·X·Y: 최소 요금 / 기준시간 (상업 요율). 상업이 최소와 같으면 생략. */
function composePrice(v) {
  const basis = v.raw?.["대관료_기준시간"];
  const commercial = v.raw?.["대관료_상업"];
  let s = has(v.priceMin) ? won(v.priceMin) : "";
  if (s && has(basis)) s += ` / ${basis}`; else if (!s && has(basis)) s = `기준 ${basis}`;
  const c = has(commercial) ? Number(String(commercial).replace(/[^0-9.]/g, "")) : null;
  if (c !== null && Number.isFinite(c) && c !== Number(v.priceMin)) s += s ? ` (상업 ${won(c)})` : `상업 ${won(c)}`;
  return s;
}
/** 초과_단위 + 초과_비율 + 초과_금액. */
function composeOver(v) {
  const parts = [];
  if (has(v.overRate)) parts.push(pct(v.overRate));
  if (has(v.overAmount)) parts.push(won(v.overAmount));
  const body = parts.join(" · ");
  const u = has(v.overUnit) ? String(v.overUnit).trim() : "";
  return u && body ? `${u} ${body}` : u || body;
}
/** 할증 주말·야간·초과 퍼센트 + 할증_기타. */
function composeSurcharge(v) {
  const parts = [];
  if (has(v.weekendSurcharge)) parts.push(`주말 ${pct(v.weekendSurcharge)}`);
  if (has(v.raw?.["할증_야간_퍼센트"])) parts.push(`야간 ${pct(v.raw["할증_야간_퍼센트"])}`);
  if (has(v.raw?.["할증_초과_퍼센트"])) parts.push(`초과 ${pct(v.raw["할증_초과_퍼센트"])}`);
  if (has(v.raw?.["할증_기타"])) parts.push(String(v.raw["할증_기타"]).trim());
  return parts.join(" · ");
}
/** 부속_냉난방비 + 부속사용료 + 부속_비고. 비고가 사용료 문장을 포함하면 긴 쪽만. */
function composeExtras(v) {
  const parts = [];
  const h = v.raw?.["부속_냉난방비"];
  if (has(h)) { const n = Number(String(h).replace(/[^0-9.]/g, "")); parts.push(`냉난방 ${/^[0-9.,\s원]+$/.test(String(h)) && Number.isFinite(n) ? won(n) : String(h).trim()}`); }
  const f = String(v.raw?.["부속사용료"] ?? "").replace(/^부속사용료:\s*/, "").trim();
  const m = String(v.raw?.["부속_비고"] ?? "").replace(/^부속사용료:\s*/, "").trim();
  if (f && m) { if (m.includes(f)) parts.push(m); else if (f.includes(m)) parts.push(f); else parts.push(f, m); }
  else if (f || m) parts.push(f || m);
  return parts.join(" · ");
}
/** 시트에서 합쳐진 칸의 원래 raw 키. 뒤에 따로 나가면 다시 중복이 된다. */
const MERGED_RAW_KEYS = new Set(["대관료_기준시간", "대관료_상업", "할증_야간_퍼센트", "할증_초과_퍼센트", "할증_기타", "부속_냉난방비", "부속사용료", "부속_비고"]);

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
  // W·X·Y 합침(9/22): 최소 요금 + 기준시간 + (상업요율). 예) "100,000원 / 3시간 (상업 190,000원)"
  ["대관료", (v) => composePrice(v)],
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
  // 요일별 시작/종료 6칸은 내보내지 않는다 — 이용가능시간 한 칸이 같은 내용을 문장으로 갖고 있다(9/22 사장님 지시).
  // 초과 단위·비율·금액 + 할증 주말·야간·초과 퍼센트 + 할증_기타 를 한 칸으로(9/22).
  // 예) "초과 시간당 50% · 주말 30% · 토·일 대관 불가"
  ["초과·할증", (v) => [composeOver(v) && `초과 ${composeOver(v)}`, composeSurcharge(v)].filter(Boolean).join(" · ")],
  // 부속_냉난방비 + 부속사용료 + 부속_비고 를 한 칸으로(9/22).
  ["부속사용료", (v) => composeExtras(v)],
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
  // raw 칸 이름의 합집합. 행마다 있는 칸이 조금씩 다르다.
  const leadNames = new Set(LEAD.map(([n]) => n));
  const rawCols = [];
  const seen = new Set();
  for (const v of venues) {
    for (const k of Object.keys(v.raw ?? {})) {
      // 밑줄로 시작하는 키(_작업로그)는 DB팀 작업 이력이라 시트에 내보내지 않는다.
      if (!seen.has(k) && !leadNames.has(k) && !isInternalRawKey(k) && !MERGED_RAW_KEYS.has(k)) { seen.add(k); rawCols.push(k); }
    }
  }
  const header = [...LEAD.map(([n]) => n), ...rawCols];
  const cell = (x) => (x === null || x === undefined ? "" : typeof x === "object" ? JSON.stringify(x) : x);
  const rows = venues.map((v) => [...LEAD.map(([, f]) => cell(f(v))), ...rawCols.map((k) => cell(v.raw?.[k]))]);
  console.log(`공간 ${rows.length}행 × ${header.length}열 (ERP 열 ${LEAD.length} + 원본 칸 ${rawCols.length})`);
  if (DRY_RUN) { console.log("--dry-run 이라 쓰지 않습니다."); process.exit(0); }

  const oauth2 = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
  oauth2.setCredentials({ refresh_token: await getRefreshToken() });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  const folderId = await findOrCreateFolder(drive, SUBFOLDER, SHEETS_FOLDER_ID);
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name = '${SHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: "files(id,name,webViewLink)",
  });
  let spreadsheetId = existing.data.files?.[0]?.id;
  let url = existing.data.files?.[0]?.webViewLink;
  if (!spreadsheetId) {
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title: SHEET_TITLE }, sheets: [{ properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } }] },
      fields: "spreadsheetId,spreadsheetUrl",
    });
    spreadsheetId = created.data.spreadsheetId;
    url = created.data.spreadsheetUrl;
    await drive.files.update({ fileId: spreadsheetId, addParents: folderId, removeParents: "root", fields: "id" });
    console.log("시트 새로 만듦");
  } else {
    console.log("기존 시트 덮어씀");
  }

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
