/**
 * 최신 원본 CSV 에 없는 공간을 venues 표에서 지운다.
 *
 * 적재(import-venues.mjs)는 upsert 라 원본에서 빠진 행을 지우지 않는다. 원본이 정리되면서
 * 주소가 바뀌면 열쇠(이름|위치)가 바뀌어 새 행이 들어오고 옛 행은 그대로 남아, 같은 공간이
 * 두 번 보이고 지도에 핀이 둘 찍힌다(9/9 적재 뒤 실제로 62개 이름이 중복됐다).
 *
 * 지우기 전에 사람이 채운 통화 기록(calledAt·calledPrice·calledNote)이 있으면 같은 이름의
 * 남는 행으로 옮긴다. 백업은 backup/ 에 남긴다.
 *
 *   node scripts/prune-venues-not-in-source.mjs --dry-run   뭐가 지워지는지만
 *   node scripts/prune-venues-not-in-source.mjs             지운다
 *   --local   드라이브 대신 C:\장소\DB 의 CSV 를 기준으로
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  makeDriveClient, findFolder, listSubfolders, findFileInFolder, downloadText,
  ROOT_FOLDER_NAME, VENUE_FOLDER_NAME, SNAPSHOT_FOLDER_NAME,
} from "./lib/drive.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const USE_LOCAL = process.argv.includes("--local");
const LOCAL_CSV = String.raw`C:\장소\DB\서울경기_대관공간_DB.csv`;
const SOURCE_NAME = "서울경기_대관공간_DB.csv";

function parseCsv(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// import-venues.mjs 와 같은 열쇠. 두 곳이 다르면 전부 "원본에 없음"으로 보여 전멸한다.
function sourceKey(name, address) {
  return crypto.createHash("sha1").update([name, address].map((v) => (v ?? "").trim()).join("|")).digest("hex").slice(0, 24);
}

async function readSourceCsv() {
  if (USE_LOCAL) { console.log(`원본: PC ${LOCAL_CSV}`); return fs.readFileSync(LOCAL_CSV, "utf8"); }
  const drive = await makeDriveClient();
  const rootId = await findFolder(drive, ROOT_FOLDER_NAME, null);
  const venueId = rootId && (await findFolder(drive, VENUE_FOLDER_NAME, rootId));
  const snapshotId = venueId && (await findFolder(drive, SNAPSHOT_FOLDER_NAME, venueId));
  if (!snapshotId) throw new Error("드라이브에 스냅샷 폴더가 없습니다.");
  const folders = (await listSubfolders(drive, snapshotId)).sort((a, b) => b.name.localeCompare(a.name));
  for (const folder of folders) {
    const file = await findFileInFolder(drive, SOURCE_NAME, folder.id);
    if (file) { console.log(`원본: 드라이브 스냅샷 ${folder.name}`); return downloadText(drive, file.id); }
  }
  throw new Error("스냅샷에 정본 CSV 가 없습니다.");
}

const csvText = (await readSourceCsv()).replace(/^\uFEFF/, "");
const rows = parseCsv(csvText).filter((r) => r.length > 1);
const cols = rows[0];
const ni = cols.indexOf("이름"), ai = cols.indexOf("위치");
const sourceKeys = new Set(rows.slice(1).map((r) => sourceKey(r[ni], r[ai])));
console.log(`원본 ${sourceKeys.size}행`);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const all = await prisma.venue.findMany({
    select: { id: true, sourceKey: true, name: true, address: true, calledAt: true, calledPrice: true, calledNote: true },
  });
  const stale = all.filter((v) => !sourceKeys.has(v.sourceKey));
  const keep = all.filter((v) => sourceKeys.has(v.sourceKey));
  const keepByName = new Map();
  for (const v of keep) keepByName.set(v.name, [...(keepByName.get(v.name) ?? []), v]);

  console.log(`venues ${all.length}건 · 원본에 없는 행 ${stale.length}건`);
  const renamed = stale.filter((v) => keepByName.has(v.name)).length;
  console.log(`  그중 같은 이름이 새 열쇠로 남아 있는 행(주소만 바뀜) ${renamed}건 · 완전히 빠진 행 ${stale.length - renamed}건`);
  for (const v of stale.slice(0, 200)) console.log(`  · ${v.name} | ${v.address ?? "-"}${keepByName.has(v.name) ? "  (→ 새 행 있음)" : ""}`);
  if (stale.length > 200) console.log(`  … 외 ${stale.length - 200}건`);

  // 통화 기록 이관: 같은 이름의 남는 행이 딱 하나일 때만. 애매하면 옮기지 않고 알린다.
  const carried = [];
  for (const v of stale) {
    if (!v.calledAt && !v.calledPrice && !v.calledNote) continue;
    const targets = keepByName.get(v.name) ?? [];
    if (targets.length === 1 && !targets[0].calledAt && !targets[0].calledNote) {
      carried.push({ from: v.id, to: targets[0].id, name: v.name });
    } else {
      console.log(`  ⚠ 통화 기록이 있는데 옮길 곳이 분명치 않음: ${v.name} (후보 ${targets.length})`);
    }
  }
  if (carried.length) console.log(`통화 기록 이관 ${carried.length}건`);

  if (DRY_RUN) { console.log("--dry-run 이라 지우지 않습니다."); }
  else if (stale.length) {
    const backup = path.join("backup", `원본에없는공간_삭제_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync("backup", { recursive: true });
    fs.writeFileSync(backup, JSON.stringify(await prisma.venue.findMany({ where: { id: { in: stale.map((v) => v.id) } } }), null, 2));
    for (const c of carried) {
      const src = stale.find((v) => v.id === c.from);
      await prisma.venue.update({ where: { id: c.to }, data: { calledAt: src.calledAt, calledPrice: src.calledPrice, calledNote: src.calledNote } });
    }
    const r = await prisma.venue.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
    console.log(`삭제 ${r.count}건 · 백업 ${backup}`);
    console.log(`venues 표 총 ${await prisma.venue.count()}건`);
  }
} finally {
  await prisma.$disconnect();
}
