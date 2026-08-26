#!/usr/bin/env node
/**
 * 공간 DB CSV 를 venues 표에 넣는다. 좌표 CSV 가 있으면 함께 채운다.
 *
 * 원본 CSV 에는 행 고유 id 가 없다. 같은 건물의 다른 방이 각각 한 행이고 이름이
 * 겹칠 수 있어, 이름·자치구·위치를 합친 값을 열쇠로 쓴다. 세 값이 모두 같으면
 * 같은 행으로 본다.
 *
 * 여러 번 돌려도 안전하다(upsert). 원본이 갱신되면 다시 돌리면 된다.
 * 다만 전화로 확인한 값(calledAt 등)은 덮지 않는다 — 사람이 채운 자료다.
 *
 * 사용법:
 *   node scripts/import-venues.mjs --dry-run     넣지 않고 통계만
 *   node scripts/import-venues.mjs --limit 50    앞 50건만
 *   node scripts/import-venues.mjs               전체
 */
import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SOURCE = String.raw`C:\Users\cybjs\Documents\Codex\seoul-db\outputs\seoul_rental_spaces_integrated_clean.csv`;
const COORDS = String.raw`C:\Users\cybjs\Documents\Codex\seoul-db\outputs\venue_coordinates.csv`;

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

/** 원본이 utf-8-sig 라 BOM 을 벗긴다. 안 벗기면 첫 헤더 이름이 어긋난다. */
function parseCsv(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift();
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const str = (v) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

const INT_MAX = 2147483647;

/**
 * "1,530,000원" 처럼 단위가 붙은 값에서 숫자를 뽑는다.
 *
 * 자릿수만 골라 이어붙이면 안 된다. 관람석 칸에는 숫자가 아니라 설명문이
 * 들어 있는 행이 있어서, 이어붙이면
 *   "615석(1층 405석, 2층 202석, 휠체어석 8석 포함)" → 615140522028
 * 처럼 터무니없는 값이 나온다. 실제로 Int 범위를 넘겨 적재가 멈췄다.
 *
 * 쉼표만 먼저 지우고(천 단위 구분자다) 맨 앞 숫자 하나만 읽는다.
 * 설명문이 있는 행은 대개 맨 앞이 대표값이다.
 */
const num = (v) => {
  const cleaned = (v ?? "").replace(/,/g, "");
  const m = /-?\d+(?:\.\d+)?/.exec(cleaned);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

/** Int 컬럼용. 범위를 넘으면 넣지 않는다 — 원문은 raw 에 남아 있다. */
const int = (v) => {
  const n = num(v);
  if (n === null) return null;
  const rounded = Math.round(n);
  return Math.abs(rounded) > INT_MAX ? null : rounded;
};

/** 원본에 행 id 가 없어 이 세 값으로 행을 구분한다. */
function sourceKey(row) {
  const parts = [row["이름"], row["자치구"], row["위치"]].map((v) => (v ?? "").trim());
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

/** 컬럼으로 옮긴 칸. 나머지는 raw 에 담는다. */
const MAPPED = new Set([
  "이름", "자치구", "위치", "유형",
  "수용_적용min", "수용_적용max", "관람석", "실면적",
  "요금_적용", "요금_적용기준", "요금_출처", "기본_시간",
  "초과_단위", "초과_비율", "초과_금액", "할증_주말_퍼센트", "부가세_구분",
  "영리대관", "토요일", "일요일", "공휴일",
  "평일_시작", "평일_종료", "토요일_시작", "토요일_종료", "일요일_시작", "일요일_종료",
  "빔", "음향", "무대", "조명", "냉난방", "주차", "대기공간",
  "전기", "화장실", "우천시", "그늘천막", "취사화기", "소음제한", "대여물품",
  "대관문의_전화", "예약URL",
]);

function toVenue(row, coord) {
  const raw = {};
  for (const [k, v] of Object.entries(row)) {
    if (MAPPED.has(k)) continue;
    const s = (v ?? "").trim();
    // 빈 칸까지 담으면 raw 가 쓸데없이 커진다. 값이 있는 것만 남긴다.
    if (s) raw[k] = s;
  }

  // 숫자로 바꾸면서 맥락이 사라지는 칸은 원문도 함께 남긴다.
  // 예: 관람석 "615석(1층 405석, 2층 202석…)" → seats 615 + raw.관람석_원문
  for (const c of ["관람석", "실면적", "요금_적용", "초과_금액"]) {
    const original = (row[c] ?? "").trim();
    if (original && /[^0-9,.\s]/.test(original)) raw[`${c}_원문`] = original;
  }

  return {
    sourceKey: sourceKey(row),
    name: str(row["이름"]) ?? "(이름 없음)",
    district: str(row["자치구"]),
    address: str(row["위치"]),
    type: str(row["유형"]),

    capacityMin: int(row["수용_적용min"]),
    capacityMax: int(row["수용_적용max"]),
    seats: int(row["관람석"]),
    areaM2: num(row["실면적"]),

    price: int(row["요금_적용"]),
    priceBasis: str(row["요금_적용기준"]),
    priceSource: str(row["요금_출처"]),
    baseHours: num(row["기본_시간"]),
    overUnit: str(row["초과_단위"]),
    overRate: num(row["초과_비율"]),
    overAmount: int(row["초과_금액"]),
    weekendSurcharge: num(row["할증_주말_퍼센트"]),
    vatType: str(row["부가세_구분"]),

    commercialUse: str(row["영리대관"]),
    saturday: str(row["토요일"]),
    sunday: str(row["일요일"]),
    holiday: str(row["공휴일"]),

    weekdayOpen: str(row["평일_시작"]),
    weekdayClose: str(row["평일_종료"]),
    satOpen: str(row["토요일_시작"]),
    satClose: str(row["토요일_종료"]),
    sunOpen: str(row["일요일_시작"]),
    sunClose: str(row["일요일_종료"]),

    beam: str(row["빔"]),
    sound: str(row["음향"]),
    stage: str(row["무대"]),
    lighting: str(row["조명"]),
    hvac: str(row["냉난방"]),
    parking: str(row["주차"]),
    waitingRoom: str(row["대기공간"]),

    electricity: str(row["전기"]),
    restroom: str(row["화장실"]),
    rainPlan: str(row["우천시"]),
    shadeTent: str(row["그늘천막"]),
    cooking: str(row["취사화기"]),
    noiseLimit: str(row["소음제한"]),
    rentalItems: str(row["대여물품"]),

    phone: str(row["대관문의_전화"]),
    reserveUrl: str(row["예약URL"]),

    lat: coord?.lat ?? null,
    lng: coord?.lng ?? null,
    geoSource: coord?.source ?? null,

    raw,
  };
}

async function main() {
  const rows = parseCsv(fs.readFileSync(SOURCE, "utf8")).slice(0, LIMIT);

  // 좌표는 같은 열쇠로 맞춘다. 없으면 좌표 없이 넣는다.
  const coords = new Map();
  if (fs.existsSync(COORDS)) {
    for (const c of parseCsv(fs.readFileSync(COORDS, "utf8"))) {
      if (!c["위도"]) continue;
      coords.set(sourceKey({ 이름: c["이름"], 자치구: c["자치구"], 위치: c["위치"] }), {
        lat: Number(c["위도"]),
        lng: Number(c["경도"]),
        source: c["좌표출처"],
      });
    }
  }

  const venues = rows.map((r) => toVenue(r, coords.get(sourceKey(r))));

  // 열쇠가 겹치는 행이 있으면 마지막 것만 남는다. 몇 건인지 알려 준다.
  const unique = new Map(venues.map((v) => [v.sourceKey, v]));
  const dupes = venues.length - unique.size;

  console.log(`원본 ${rows.length}행`);
  console.log(`  좌표 붙은 행 ${venues.filter((v) => v.lat !== null).length}`);
  console.log(`  열쇠 중복으로 합쳐진 행 ${dupes}`);
  console.log(`  넣을 행 ${unique.size}\n`);

  if (DRY_RUN) {
    console.log("--dry-run 이라 여기서 멈춥니다.");
    console.log("\n=== 첫 행 예시 ===");
    const first = [...unique.values()][0];
    for (const [k, v] of Object.entries(first)) {
      if (k === "raw") { console.log(`  raw: ${Object.keys(v).length}개 칸`); continue; }
      if (v !== null) console.log(`  ${k}: ${String(v).slice(0, 50)}`);
    }
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    let done = 0;
    for (const v of unique.values()) {
      const { sourceKey: key, ...rest } = v;
      await prisma.venue.upsert({
        where: { sourceKey: key },
        // 전화로 확인한 값은 사람이 채운 자료다. 원본을 다시 넣어도 덮지 않는다.
        update: rest,
        create: { sourceKey: key, ...rest },
      });
      done += 1;
      if (done % 200 === 0 || done === unique.size) {
        process.stdout.write(`\r  ${done}/${unique.size}`);
      }
    }
    console.log("\n");
    console.log(`venues 표 총 ${await prisma.venue.count()}건`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n실패:", err.message);
  process.exitCode = 1;
});
