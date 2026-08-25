#!/usr/bin/env node
/**
 * 공간 DB 원본 파일을 구글 드라이브에 백업한다.
 *
 * 넘겨받은 CSV/엑셀은 사장님 PC 한 곳에만 있다. ERP 에 적재하기 전 단계라
 * 그 PC 가 잘못되면 되돌릴 방법이 없으므로 원본 그대로 드라이브에 올려 둔다.
 *
 * 사용법:
 *   node scripts/backup-venue-db.mjs            실제 업로드
 *   node scripts/backup-venue-db.mjs --dry-run  올릴 대상만 확인
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const DRY_RUN = process.argv.includes("--dry-run");

const ROOT_FOLDER_NAME = "천우영 시스템";
const PROJECT_FOLDER_NAME = "공간 DB";
/** 매번 덮어쓰지 않고 받은 날짜별로 쌓는다. 원본 이력이 남아야 되돌릴 수 있다. */
const SNAPSHOT_FOLDER_NAME = "원본 스냅샷";

const SOURCE_DIR = String.raw`C:\Users\cybjs\Documents\Codex\seoul-db\outputs`;
const FILES = [
  {
    name: "seoul_rental_spaces_integrated_clean.csv",
    mimeType: "text/csv",
    note: "정본 CSV (utf-8-sig, 3721행 x 150열)",
  },
  {
    name: "서울경기_대관공간_DB_0826_0133.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    note: "최신 엑셀 (9탭)",
  },
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function makeDriveClientAsOwner() {
  const refreshToken = process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("GOOGLE_DRIVE_OWNER_REFRESH_TOKEN 이 .env 에 없습니다.");
  }
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

/** 이름이 같은 폴더가 있으면 재사용한다. 실행할 때마다 폴더가 늘어나면 안 된다. */
async function findOrCreateFolder(drive, name, parentId) {
  const escaped = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");

  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" });
  if (res.data.files?.length) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  return created.data.id;
}

async function main() {
  console.log(`대상 폴더: ${ROOT_FOLDER_NAME} > ${PROJECT_FOLDER_NAME} > ${SNAPSHOT_FOLDER_NAME} > ${stamp()}\n`);

  const targets = [];
  for (const f of FILES) {
    const full = path.join(SOURCE_DIR, f.name);
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

  const drive = await makeDriveClientAsOwner();
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const projectId = await findOrCreateFolder(drive, PROJECT_FOLDER_NAME, rootId);
  const snapshotId = await findOrCreateFolder(drive, SNAPSHOT_FOLDER_NAME, projectId);
  const dateId = await findOrCreateFolder(drive, stamp(), snapshotId);

  console.log("");
  for (const t of targets) {
    const res = await drive.files.create({
      requestBody: { name: t.name, parents: [dateId] },
      media: { mimeType: t.mimeType, body: fs.createReadStream(t.full) },
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
