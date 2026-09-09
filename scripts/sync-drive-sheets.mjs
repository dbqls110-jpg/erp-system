#!/usr/bin/env node
/**
 * "천우영 시스템" 드라이브에 있는 구글 시트를 ERP 시트 탭에 등록한다.
 *
 * 사람이 드라이브에서 폴더로 정리해 둔 것을 그대로 화면 분류로 쓴다. 분류를 ERP 에
 * 따로 적어 두면 폴더를 옮겼을 때 둘이 어긋나고, 어느 쪽이 맞는지 알 수 없게 된다.
 * 그래서 분류는 저장하되 정본은 드라이브로 본다 — 다시 돌리면 폴더 기준으로 맞춰진다.
 *
 * 짝은 시트 ID 로 맞춘다. 이름이나 URL 모양이 달라도 같은 문서면 같은 행으로 본다.
 * 드라이브에 없는 기존 행(외부 소유 시트 등)은 건드리지 않는다. 지우지도 않는다.
 *
 * 사용법:
 *   node scripts/sync-drive-sheets.mjs --dry-run   바뀔 것만 확인
 *   node scripts/sync-drive-sheets.mjs             실제 반영
 */
import "dotenv/config";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getRefreshToken } from "./lib/drive.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
/**
 * 대상은 "천우영 시스템 > 시트" 폴더 안쪽뿐이다.
 * 사장님 지시(2026-09-09): 시트 폴더에 있는 것만 화면에 올린다. 자료 폴더의
 * 조사용 시트까지 올리면 목록이 길어져 정작 매일 쓰는 문서가 묻힌다.
 */
const SHEETS_FOLDER_ID = "1sINhEgqROuCDybbvD5PbnpWaVH8V0mi_";
const FOLDER = "application/vnd.google-apps.folder";
const SHEET = "application/vnd.google-apps.spreadsheet";

/** 시트 ID 만 뽑는다. URL 모양이 바뀌어도 같은 문서를 같은 것으로 보기 위해서다. */
function sheetId(url) {
  return /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(String(url ?? ""))?.[1] ?? null;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const oauth2 = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
    oauth2.setCredentials({ refresh_token: await getRefreshToken() });
    const drive = google.drive({ version: "v3", auth: oauth2 });

    const rootRes = await drive.files.get({ fileId: SHEETS_FOLDER_ID, fields: "id,name,mimeType" });
    const root = rootRes.data;
    if (root.mimeType !== FOLDER) throw new Error("시트 폴더 ID 가 폴더가 아닙니다.");

    /** 폴더를 훑어 시트를 모은다. 분류는 바로 위 폴더 이름이다. */
    const found = [];
    async function walk(folderId, folderName, trail, depth) {
      if (depth > 4) return;
      let pageToken;
      do {
        const res = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: "nextPageToken,files(id,name,mimeType)",
          pageSize: 200,
          pageToken,
        });
        for (const file of res.data.files ?? []) {
          if (file.mimeType === FOLDER) {
            await walk(file.id, file.name, [...trail, file.name], depth + 1);
          } else if (file.mimeType === SHEET) {
            found.push({
              id: file.id,
              name: file.name,
              // 루트 바로 밑 시트는 위 폴더가 루트라 분류로 쓰기 어색하다. 그때만 빈 분류로 둔다.
              category: depth === 0 ? null : folderName,
              path: [...trail].join(" / "),
            });
          }
        }
        pageToken = res.data.nextPageToken;
      } while (pageToken);
    }
    await walk(root.id, root.name, [root.name], 0);

    const existing = await prisma.sheetLink.findMany();
    const byId = new Map();
    for (const row of existing) {
      const id = sheetId(row.url);
      if (id) byId.set(id, row);
    }

    const added = [], updated = [], same = [];
    for (const sheet of found) {
      const row = byId.get(sheet.id);
      const url = `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`;
      if (!row) {
        added.push({ ...sheet, url });
        continue;
      }
      if (row.name !== sheet.name || row.category !== sheet.category) {
        updated.push({ ...sheet, url, before: `${row.category ?? "(없음)"} / ${row.name}` });
      } else {
        same.push(sheet);
      }
    }
    const foundIds = new Set(found.map((s) => s.id));
    const untouched = existing.filter((row) => !foundIds.has(sheetId(row.url) ?? ""));

    console.log(`드라이브 시트 ${found.length}개 · ERP 등록 ${existing.length}개`);
    console.log(`  새로 등록 ${added.length} · 분류·이름 갱신 ${updated.length} · 그대로 ${same.length}`);
    console.log(`  드라이브에 없어 손대지 않음 ${untouched.length}`);
    for (const s of added) console.log(`  + [${s.category ?? "-"}] ${s.name}`);
    for (const s of updated) console.log(`  ~ ${s.before}  →  [${s.category ?? "-"}] ${s.name}`);
    for (const r of untouched) console.log(`  = [${r.category ?? "-"}] ${r.name} (그대로 둠)`);

    if (DRY_RUN) {
      console.log("\n--dry-run 이라 반영하지 않았습니다.");
      return;
    }

    for (const s of [...added, ...updated]) {
      const row = byId.get(s.id);
      if (row) {
        await prisma.sheetLink.update({
          where: { id: row.id },
          data: { name: s.name, category: s.category, url: s.url },
        });
      } else {
        await prisma.sheetLink.create({
          data: { name: s.name, url: s.url, category: s.category, description: s.path, order: 0 },
        });
      }
    }
    console.log(`\n반영 완료: 새로 ${added.length}개 · 갱신 ${updated.length}개`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n실패:", err.message);
  process.exitCode = 1;
});
