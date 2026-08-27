#!/usr/bin/env node
/**
 * 공간 DB 의 주소를 좌표로 바꾼다.
 *
 * 넘겨받은 CSV 에는 위도·경도가 없다. 지도에 핀을 찍으려면 먼저 좌표가 있어야 한다.
 * 카카오 REST API 를 쓴다(일일 10만 건 무료, 여기서는 최대 7천여 건).
 *
 * 사용법:
 *   node scripts/geocode-venues.mjs --limit 20   앞 20건만 시험
 *   node scripts/geocode-venues.mjs              전체
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const SOURCE = String.raw`C:\Users\cybjs\Documents\Codex\seoul-db\outputs\seoul_rental_spaces_integrated_clean.csv`;
const OUTPUT = String.raw`C:\Users\cybjs\Documents\Codex\seoul-db\outputs\venue_coordinates.csv`;

const KEY = process.env.KAKAO_REST_API_KEY;
if (!KEY) {
  console.error("KAKAO_REST_API_KEY 가 .env 에 없습니다.");
  process.exit(1);
}

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
/** 동시 요청 수. 너무 올리면 카카오가 429 를 준다. */
const CONCURRENCY = 5;

/** 아주 단순한 CSV 파서. 이 파일은 따옴표 안에 줄바꿈이 들어 있어 라이브러리 없이 처리한다. */
function parseCsv(raw) {
  // 원본이 utf-8-sig 라 맨 앞에 BOM 이 있다. 벗기지 않으면 첫 헤더가 "﻿이름" 이
  // 되어 row["이름"] 이 통째로 undefined 가 된다. 실제로 이름 검색 폴백이
  // 한 번도 동작하지 않았다.
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
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift();
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/**
 * 지오코딩에 쓸 주소를 뽑는다.
 *
 * 원본 '위치' 칸에는 도로명주소 뒤에 층·호·시설명이 붙어 있다. 그대로 넣으면
 * 검색이 실패하므로 괄호 이후를 자르고 도로명 + 번지까지만 남긴다.
 *
 * 정규식이 탐욕적인 것이 중요하다. 게으르게 잡으면 "여의대방로62길 15" 를
 * "여의대방로62" 로 잘라 전혀 다른 곳을 가리킨다. 실제로 1,176행이 그랬다.
 */
function cleanAddress(raw) {
  const a = (raw ?? "").trim().replace(/\s*\(.*$/, "");
  const m = /^(.*[로길]\s*\d+(?:-\d+)?)/.exec(a);
  return (m ? m[1] : a).trim();
}

async function kakao(pathname, params) {
  const url = new URL(`https://dapi.kakao.com${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
    if (res.status === 429) {
      // 쿼터가 아니라 순간 속도 제한이다. 잠깐 쉬고 다시 시도한다.
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error("429 가 계속됩니다. 잠시 뒤 다시 실행하세요.");
}

/**
 * 좌표를 찾는다. 주소 검색을 먼저 하고, 실패하면 이름으로 장소 검색을 한다.
 *
 * '위치' 가 "서울특별시 금천구 / 서울청년센터 금천" 처럼 주소가 아닌 행이 있다.
 * 그런 곳은 시설 이름으로 찾는 편이 낫다.
 */
async function locate(row) {
  const address = cleanAddress(row["위치"]);

  if (address) {
    const r = await kakao("/v2/local/search/address.json", { query: address, size: "1" });
    const hit = r.documents?.[0];
    if (hit) {
      return { lat: Number(hit.y), lng: Number(hit.x), source: "주소", matched: address };
    }
  }

  const name = (row["이름"] ?? "").trim();
  const gu = (row["자치구"] ?? "").trim();
  if (name) {
    const query = [gu, name].filter(Boolean).join(" ");
    const r = await kakao("/v2/local/search/keyword.json", { query, size: "1" });
    const hit = r.documents?.[0];
    if (hit) {
      return { lat: Number(hit.y), lng: Number(hit.x), source: "이름검색", matched: query };
    }
  }

  return null;
}

function csvEscape(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(SOURCE, "utf8")).slice(0, LIMIT);
  console.log(`대상 ${rows.length}행\n`);

  const results = new Array(rows.length);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const i = cursor;
      cursor += 1;
      try {
        results[i] = await locate(rows[i]);
      } catch (err) {
        results[i] = { error: err.message };
      }
      done += 1;
      if (done % 100 === 0 || done === rows.length) {
        process.stdout.write(`\r  ${done}/${rows.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("\n");

  const stat = { 주소: 0, 이름검색: 0, 실패: 0, 오류: 0 };
  const lines = ['"이름","자치구","위치","위도","경도","좌표출처","조회문자열"'];

  rows.forEach((row, i) => {
    const r = results[i];
    if (r?.error) stat.오류 += 1;
    else if (!r) stat.실패 += 1;
    else stat[r.source] += 1;

    lines.push([
      row["이름"], row["자치구"], row["위치"],
      r?.lat ?? "", r?.lng ?? "", r?.source ?? (r?.error ? "오류" : "실패"),
      r?.matched ?? r?.error ?? "",
    ].map(csvEscape).join(","));
  });

  fs.writeFileSync(OUTPUT, "\ufeff" + lines.join("\n"), "utf8");

  const found = stat.주소 + stat.이름검색;
  console.log("=== 결과 ===");
  console.log(`  주소로 찾음   ${stat.주소}`);
  console.log(`  이름으로 찾음 ${stat.이름검색}`);
  console.log(`  못 찾음       ${stat.실패}`);
  console.log(`  오류          ${stat.오류}`);
  console.log(`  성공률        ${((found / rows.length) * 100).toFixed(1)}%`);
  console.log(`\n저장: ${path.basename(OUTPUT)}`);
}

main().catch((err) => {
  console.error("\n실패:", err.message);
  process.exitCode = 1;
});
