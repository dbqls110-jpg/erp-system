#!/usr/bin/env node
/**
 * ERP 에 등록된 구글 시트를 "천우영 시스템" 아래로 모은다.
 *
 * 시트가 드라이브 여기저기 흩어져 있으면 사람이 직접 찾을 때 헤맨다. ERP 는 링크로
 * 접근하니 상관없지만, 드라이브를 열어 보는 사람에게는 위치가 전부다.
 *
 * 옮기는 것은 복사가 아니라 부모만 바꾸는 것이라 파일 ID 가 그대로다. ERP 에 등록된
 * 링크도 그대로 살아 있다.
 *
 * 사용법:
 *   node scripts/organize-sheets.mjs --dry-run   현재 위치와 옮길 곳만 확인
 *   node scripts/organize-sheets.mjs             실제로 옮김
 */
import "dotenv/config";
import crypto from "node:crypto";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = "천우영 시스템";
const SHEETS_FOLDER = "시트";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function getRefreshToken() {
  const encKey =
    process.env.DRIVE_TOKEN_ENC_KEY ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  const record = await prisma.agentAuditLog.findFirst({
    where: { action: "drive_oauth_active" },
    orderBy: { createdAt: "desc" },
    select: { result: true },
  });
  const enc = record?.result?.enc;
  if (enc && encKey) {
    const key = crypto.createHash("sha256").update(encKey).digest();
    const buf = Buffer.from(enc, "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  }
  const envToken = process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  if (envToken) return envToken;
  throw new Error("Drive refresh token 을 찾지 못했습니다.");
}

const idFromUrl = (url) => /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url ?? "")?.[1] ?? null;

async function findOrCreateFolder(drive, name, parentId) {
  const escaped = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const found = await drive.files.list({ q, fields: "files(id)", spaces: "drive" });
  if (found.data.files?.length) return found.data.files[0].id;

  const made = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  return made.data.id;
}

/** 부모 폴더 이름을 따라 올라가 사람이 읽을 수 있는 경로로 만든다. */
async function pathOf(drive, fileId, depth = 0) {
  if (depth > 6) return "…";
  const meta = await drive.files.get({ fileId, fields: "name, parents" });
  const parent = meta.data.parents?.[0];
  if (!parent) return meta.data.name;
  try {
    const up = await pathOf(drive, parent, depth + 1);
    return `${up} / ${meta.data.name}`;
  } catch {
    return `(공유 위치) / ${meta.data.name}`;
  }
}

async function main() {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: await getRefreshToken() });
  const drive = google.drive({ version: "v3", auth: oauth2 });

  const links = await prisma.sheetLink.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });

  console.log(`ERP 에 등록된 시트 ${links.length}건\n`);

  const plan = [];
  for (const link of links) {
    const fileId = idFromUrl(link.url);
    if (!fileId) {
      console.log(`  ⚠ 시트 주소가 아님: ${link.name} (${link.url.slice(0, 50)})`);
      continue;
    }

    let meta;
    try {
      meta = await drive.files.get({
        fileId,
        fields: "id, name, parents, ownedByMe, owners(emailAddress), capabilities(canMoveItemWithinDrive)",
      });
    } catch (err) {
      // 남의 소유거나 지워진 시트는 건드릴 수 없다.
      console.log(`  ⚠ 접근 불가: ${link.name} — ${err.message.slice(0, 60)}`);
      continue;
    }

    if (meta.data.capabilities?.canMoveItemWithinDrive === false) {
      console.log(`  ⚠ 옮길 권한 없음: ${link.name} (소유자 ${meta.data.owners?.[0]?.emailAddress ?? "?"})`);
      continue;
    }

    // 남의 소유 파일은 옮기지 않는다.
    //
    // 그런 파일은 부모 폴더가 없고 "공유 문서함"에 있을 뿐이다. 우리 폴더에 넣으면
    // 원본이 옮겨지는 것이 아니라 바로가기만 생긴다. 원본은 상대 드라이브에 남고,
    // 그쪽에서 지우면 우리 폴더에서도 사라진다. 정리한 것처럼 보이지만 아니다.
    if (meta.data.ownedByMe === false) {
      const owner = meta.data.owners?.[0]?.emailAddress ?? "?";
      console.log(`  건너뜀: ${link.name} — 남의 소유(${owner}). 공유 문서함에 그대로 둔다.`);
      continue;
    }

    const where = await pathOf(drive, fileId).catch(() => "(알 수 없음)");
    // 분류가 없으면 "기타" 로 모은다. 폴더 이름에 못 쓰는 글자는 바꾼다.
    const folder = (link.category ?? "기타").replace(/[\\/]/g, "-");

    plan.push({ link, fileId, parents: meta.data.parents ?? [], folder, name: meta.data.name });
    console.log(`  ${meta.data.name}`);
    console.log(`      지금: ${where}`);
    console.log(`      이동: ${ROOT} / ${SHEETS_FOLDER} / ${folder}`);
  }

  console.log(`\n옮길 수 있는 시트 ${plan.length}건`);
  if (DRY_RUN) {
    console.log("--dry-run 이라 여기서 멈춥니다.");
    return;
  }

  const rootId = await findOrCreateFolder(drive, ROOT, null);
  const sheetsId = await findOrCreateFolder(drive, SHEETS_FOLDER, rootId);
  const cache = new Map();

  console.log("");
  for (const item of plan) {
    if (!cache.has(item.folder)) {
      cache.set(item.folder, await findOrCreateFolder(drive, item.folder, sheetsId));
    }
    const target = cache.get(item.folder);

    // 이미 그 폴더에 있으면 건드리지 않는다.
    if (item.parents.includes(target)) {
      console.log(`  그대로: ${item.name}`);
      continue;
    }

    await drive.files.update({
      fileId: item.fileId,
      addParents: target,
      removeParents: item.parents.join(","),
      fields: "id",
    });
    console.log(`  옮김:   ${item.name} → ${item.folder}`);
  }

  const folder = await drive.files.get({ fileId: sheetsId, fields: "webViewLink" });
  console.log(`\n시트 폴더: ${folder.data.webViewLink}`);
}

main()
  .catch((err) => {
    console.error("\n실패:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
