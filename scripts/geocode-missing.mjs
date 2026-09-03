#!/usr/bin/env node
/**
 * 좌표가 없는 공간만 찾아 채운다.
 *
 * 전체를 다시 지오코딩하는 scripts/geocode-venues.mjs 와 달리, DB 에서 lat 이 비어 있는
 * 행만 골라 처리한다. 원본이 정리되면서 주소가 바뀐 행은 옛 좌표와 연결이 끊기는데,
 * 그때마다 3,700곳을 다시 돌릴 이유가 없다.
 *
 * DB 와 좌표 CSV 양쪽에 쓴다. CSV 에 안 쓰면 다음 적재 때 lat 이 null 로 덮인다
 * (import-venues.mjs 의 toVenue 가 좌표 CSV 를 기준으로 삼는다).
 *
 * 사용법:
 *   node scripts/geocode-missing.mjs --limit 20   앞 20건만 시험
 *   node scripts/geocode-missing.mjs              전체
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COORDS = String.raw`C:\Users\cybjs\Documents\Codex\seoul-db\outputs\venue_coordinates.csv`;
const KEY = process.env.KAKAO_REST_API_KEY;
if (!KEY) { console.error("KAKAO_REST_API_KEY 가 없습니다."); process.exit(1); }

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

/** 괄호 뒤를 자르고 도로명까지만 남긴다. 탐욕적 매칭이라 "여의대방로62길 15" 가 보존된다. */
function cleanAddress(raw) {
  const a = (raw ?? "").trim().replace(/\s*\(.*$/, "");
  // "망우로 지하 55" 처럼 도로명과 번지 사이에 말이 끼는 행이 있다. 그것도 번지까지 잡는다.
  const m = /^(.*[로길](?:\s*지하)?\s*\d+(?:-\d+)?)/.exec(a);
  return (m ? m[1] : a).trim();
}

/** 서울·경기·인천을 넉넉히 감싸는 범위. 이 밖이면 다른 동네를 잘못 집은 것이다. */
const BOUNDS = { latMin: 36.9, latMax: 38.3, lngMin: 126.0, lngMax: 127.9 };

/**
 * 카카오가 돌려준 곳이 정말 그 공간인지 본다.
 *
 * 이름으로 검색하면 같은 이름의 다른 동네 가게가 걸린다. 실제로 고척스카이돔이 충북에,
 * 하남문화예술회관이 전남에 찍혔다. 지도에 엉뚱한 핀이 찍히는 것은 핀이 없는 것보다 나쁘다 —
 * 없으면 확인하지만 있으면 믿는다.
 */
function plausible(hit, district) {
  const lat = Number(hit.y), lng = Number(hit.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax) return false;
  if (lng < BOUNDS.lngMin || lng > BOUNDS.lngMax) return false;

  // 자치구를 아는 행은 결과 주소에 그 이름이 들어 있어야 한다.
  // "구로구" → "구로" 로 비교하는 것은 카카오가 "서울 구로구" 로 적기 때문이다.
  const where = `${hit.address_name ?? ""} ${hit.road_address_name ?? ""}`;
  const gu = (district ?? "").replace(/[시군구]$/, "").trim();
  if (gu && gu.length >= 2 && !where.includes(gu)) return false;
  return true;
}

async function kakao(pathname, params) {
  const url = new URL(`https://dapi.kakao.com${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error("429 가 계속됩니다. 잠시 뒤 다시 실행하세요.");
}

/**
 * 이름에서 건물 이름만 뽑는다.
 *
 * 좌표를 못 찾는 행들은 이름이 이렇게 생겼다:
 *   "2층 시민홀 - [서울시민대학 동남권캠퍼스] 시민홀"
 * 통째로 검색하면 하나도 안 나오는데, 대괄호 안만 넣으면 바로 찾힌다.
 * 대괄호가 없으면 " - " 앞뒤 중 긴 쪽을 쓴다 — 방 이름보다 건물 이름이 대개 길다.
 */
function buildingNames(name) {
  const raw = (name ?? "").trim();
  const out = [];
  const push = (v) => {
    const t = (v ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (t && t.length >= 2 && !out.includes(t)) out.push(t);
  };

  // 대괄호 안이 건물 이름인 경우: "2층 시민홀 - [서울시민대학 동남권캠퍼스] 시민홀"
  const bracket = /\[([^\]]+)\]/.exec(raw);
  if (bracket) push(bracket[1]);

  // " - " 로 나뉜 경우 앞이 건물, 뒤가 방인 경우가 많다:
  //   "한성백제박물관 - 한성백제홀(강당) (26. 7월)"
  // 반대인 경우도 있어서(방 - 건물) 양쪽 다 후보로 넣는다. 길이로 고르면 틀린다 —
  // 방 이름이 더 긴 경우가 실제로 많았다.
  const parts = raw.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  for (const part of parts) push(part);

  push(raw);
  return out;
}

/**
 * 주소로 먼저 찾고, 안 되면 이름으로 장소 검색을 한다.
 *
 * '위치' 칸이 "서울특별시 강동구 / 2층 시민홀" 처럼 주소가 아닌 행이 많다.
 * 그래서 이름 검색이 실제로는 주된 경로다.
 */
async function locate(v) {
  const address = cleanAddress(v.address);
  const buildings = buildingNames(v.name);

  // 주소 검색(address.json)은 이 키로 아무것도 못 찾는다 — "서울 양천구 목동서로 20"
  // 같은 멀쩡한 도로명도 빈 결과다. 반면 키워드 검색은 주소를 넣어도 잘 찾는다.
  // 그래서 주소든 이름이든 전부 키워드 검색으로 보낸다.
  const queries = [];
  // "/" 가 들어 있으면 주소가 아니라 "지역 / 방이름" 형태다. 넣어 봐야 헛돈다.
  if (address && !address.includes("/")) queries.push(address);
  for (const b of buildings) {
    if (v.district) queries.push(`${v.district} ${b}`);
    queries.push(b);
  }

  for (const query of queries) {
    if (!query.trim()) continue;
    const r = await kakao("/v2/local/search/keyword.json", { query, size: "5" });
    // 첫 결과만 보면 같은 이름의 다른 동네가 걸린다. 그럴듯한 것 중 첫 번째를 쓴다.
    const hit = (r.documents ?? []).find((d) => plausible(d, v.district));
    if (hit) return { lat: Number(hit.y), lng: Number(hit.x), source: query === address ? "주소" : "이름" };
  }
  return null;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const targets = (await prisma.venue.findMany({
  where: { lat: null },
  select: { id: true, name: true, district: true, address: true },
  orderBy: { name: "asc" },
})).slice(0, LIMIT);

console.log(`좌표 없는 공간 ${targets.length}곳\n`);

const found = [];
let done = 0, fail = 0;
for (const v of targets) {
  try {
    const hit = await locate(v);
    if (hit) {
      await prisma.venue.update({ where: { id: v.id }, data: { lat: hit.lat, lng: hit.lng, geoSource: hit.source } });
      found.push({ ...v, ...hit });
      done += 1;
    } else { fail += 1; }
  } catch (err) {
    console.error(`  실패: ${v.name} — ${err.message.slice(0, 60)}`);
    fail += 1;
  }
  if ((done + fail) % 25 === 0) process.stdout.write(`  ${done + fail}/${targets.length}`);
}

console.log(`\n\n찾음 ${done}곳 · 못 찾음 ${fail}곳`);

// 좌표 CSV 에도 남긴다. 안 남기면 다음 적재 때 방금 채운 값이 null 로 덮인다.
if (found.length > 0 && fs.existsSync(COORDS)) {
  const esc = (s) => (/[",\n]/.test(s ?? "") ? `"${String(s).replace(/"/g, '""')}"` : (s ?? ""));
  const lines = found.map((f) => [f.name, f.district, f.address, f.lat, f.lng, f.source].map(esc).join(","));
  fs.appendFileSync(COORDS, "\n" + lines.join("\n"), "utf8");
  console.log(`좌표 CSV 에 ${found.length}줄 추가: ${COORDS}`);
}

await prisma.$disconnect();
