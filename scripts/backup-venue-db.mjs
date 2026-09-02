#!/usr/bin/env node
/**
 * 공간 DB 원본 파일을 구글 드라이브에 백업한다.
 *
 * 넘겨받은 CSV/엑셀은 사장님 PC 한 곳에만 있다. 그 PC 의 outputs 폴더에는 작업
 * 중에 만든 백업 CSV 가 수백 개 쌓여 있어 어느 것이 정본인지 사람이 구분하기
 * 어렵다. 정본만 골라 드라이브에 날짜별로 올려 두고, 적재는 그쪽에서 읽는다
 * (scripts/import-venues.mjs).
 *
 * 사용법:
 *   node scripts/backup-venue-db.mjs            실제 업로드
 *   node scripts/backup-venue-db.mjs --dry-run  올릴 대상만 확인
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT_FOLDER_NAME,
  SNAPSHOT_FOLDER_NAME,
  VENUE_FOLDER_NAME,
  findFileInFolder,
  findOrCreateFolder,
  makeDriveClient,
} from "./lib/drive.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

// 2026-09-02: 원본 정리 결과가 이 폴더로 옮겨졌다. 좌표 CSV 만 예전 위치에 남아 있다.
const SOURCE_DIR = String.raw`C:\장소\DB`;
const COORDS_DIR = String.raw`C:\Users\cybjs\Documents\Codex\seoul-db\outputs`;
const FILES = [
  {
    name: "서울경기_대관공간_DB.csv",
    mimeType: "text/csv",
    note: "정본 CSV (정리 후 3,709행 x 147열)",
  },
  {
    // 좌표를 빼먹으면 드라이브에서 적재했을 때 지도에 핀이 하나도 안 찍힌다.
    // 다시 지오코딩하면 카카오 쿼터를 또 쓴다.
    name: "venue_coordinates.csv",
    dir: COORDS_DIR,
    mimeType: "text/csv",
    note: "지오코딩 결과. 새 정본에 좌표 열이 없어 이 파일이 계속 필요하다.",
  },
  {
    name: "서울경기_대관공간_DB.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    note: "정본 엑셀",
  },
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const today = stamp();
  console.log(`대상 폴더: ${ROOT_FOLDER_NAME} > ${VENUE_FOLDER_NAME} > ${SNAPSHOT_FOLDER_NAME} > ${today}\n`);

  const targets = [];
  for (const f of FILES) {
    const full = path.join(f.dir ?? SOURCE_DIR, f.name);
    if (!fs.existsSync(full)) {
      console.log(`  건너뜀 (파일 없음): ${f.name}`);
      continue;
    }
    const size = fs.statSync(full).size;
    targets.push({ ...f, full, size });
    console.log(`  올릴 파일: ${f.name}  ${(size / 1024 / 1024).toFixed(1)}MB  — ${f.note}`);
  }
  if (targets.length === 0) throw new Error("올릴 파일이 없습니다.");

  if (DRY_RUN) {
    console.log("\n--dry-run 이라 업로드하지 않고 종료합니다.");
    return;
  }

  const drive = await makeDriveClient();
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const venueId = await findOrCreateFolder(drive, VENUE_FOLDER_NAME, rootId);
  const snapshotId = await findOrCreateFolder(drive, SNAPSHOT_FOLDER_NAME, venueId);
  const dateId = await findOrCreateFolder(drive, today, snapshotId);

  console.log("");
  for (const t of targets) {
    const media = { mimeType: t.mimeType, body: fs.createReadStream(t.full) };

    // 같은 날 두 번 돌리는 일이 있다. 드라이브는 이름이 같아도 파일을 또 만들기
    // 때문에, 그대로 두면 폴더 안에 같은 이름이 여러 개 남고 적재가 어느 것을
    // 읽을지 알 수 없게 된다. 있으면 새 버전으로 덮는다(파일 ID 는 그대로).
    const existing = await findFileInFolder(drive, t.name, dateId);
    if (existing) {
      if (Number(existing.size) === t.size) {
        console.log(`  그대로: ${t.name} (내용 같음)`);
        continue;
      }
      const res = await drive.files.update({
        fileId: existing.id,
        media,
        fields: "id, name, webViewLink",
      });
      console.log(`  새 버전: ${res.data.name}`);
      console.log(`        ${res.data.webViewLink}`);
      continue;
    }

    const res = await drive.files.create({
      requestBody: { name: t.name, parents: [dateId] },
      media,
      fields: "id, name, size, webViewLink",
    });
    console.log(`  올림: ${res.data.name}`);
    console.log(`        ${res.data.webViewLink}`);
  }

  const folder = await drive.files.get({ fileId: dateId, fields: "webViewLink" });
  console.log(`\n백업 폴더: ${folder.data.webViewLink}`);
}

main().catch((err) => {
  console.error("\n실패:", err.message);
  process.exitCode = 1;
});
