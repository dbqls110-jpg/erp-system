#!/usr/bin/env node
/**
 * 드라이브 최상위에 흩어져 있던 업무 파일을 "천우영 시스템" 아래로 옮긴다.
 *
 * 드라이브의 이동은 복사가 아니라 부모만 바꾸는 것이라 파일 ID 가 그대로다.
 * 따라서 기존 링크는 그대로 살아 있다. 다만 공유 중인 파일이면 상대방 화면에서
 * 위치가 바뀐다.
 *
 * 사용법:
 *   node scripts/organize-drive.mjs --dry-run   무엇이 어디로 갈지만 확인
 *   node scripts/organize-drive.mjs             실제로 옮김
 */
import "dotenv/config";
import crypto from "node:crypto";
import { google } from "googleapis";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT_FOLDER_NAME = "천우영 시스템";

/**
 * 옮길 파일과 목적지.
 *
 * 이름으로 찾는다. ID 를 박아 두면 사장님이 파일 이름을 바꿨을 때 조용히
 * 엉뚱한 걸 건드리는 대신 "못 찾음"으로 멈춘다.
 */
const MOVES = [
  { name: "송파·성남·하남 인근 200-250명 체육대회 대관 후보", to: ["자료", "공간 후보 리스트"] },
  { name: "서울_소극장_대여공간_리스트_초안", to: ["자료", "공간 후보 리스트"] },
  { name: "청소 파트너 컨택리스트", to: ["자료", "업체 연락처"] },
  { name: "쉐어잇 팝업 제휴업체 후보", to: ["자료", "업체 연락처"] },
  { name: "영남권 중고 음향업체 통합 리스트", to: ["자료", "업체 연락처"] },
];

async function getRefreshToken() {
  const encKey =
    process.env.DRIVE_TOKEN_ENC_KEY ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
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
  } finally {
    await prisma.$disconnect();
  }
  const envToken = process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  if (envToken) return envToken;
  throw new Error("Drive refresh token 을 찾지 못했습니다.");
}

async function makeDrive() {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: await getRefreshToken() });
  return google.drive({ version: "v3", auth: oauth2 });
}

async function findOrCreateFolder(drive, name, parentId, create) {
  const escaped = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const res = await drive.files.list({ q, fields: "files(id)", spaces: "drive" });
  if (res.data.files?.length) return res.data.files[0].id;
  if (!create) return null;
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

/** 최상위(내 드라이브 바로 아래)에서 이름으로 찾는다. */
async function findAtRoot(drive, name) {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${escaped}' and trashed = false and 'root' in parents`,
    fields: "files(id, name, mimeType, parents)",
    spaces: "drive",
  });
  return res.data.files ?? [];
}

async function main() {
  const drive = await makeDrive();

  // 먼저 전부 찾아본다. 하나라도 없으면 옮기기 전에 알린다.
  const plan = [];
  for (const move of MOVES) {
    const found = await findAtRoot(drive, move.name);
    if (found.length === 0) {
      console.log(`  ⚠ 최상위에서 못 찾음: ${move.name}`);
      continue;
    }
    if (found.length > 1) {
      console.log(`  ⚠ 같은 이름이 ${found.length}개: ${move.name} — 건너뜁니다`);
      continue;
    }
    plan.push({ file: found[0], to: move.to });
    console.log(`  ${move.name}`);
    console.log(`      → ${ROOT_FOLDER_NAME} / ${move.to.join(" / ")}`);
  }

  if (plan.length === 0) throw new Error("옮길 파일이 없습니다.");
  console.log(`\n총 ${plan.length}개`);

  if (DRY_RUN) {
    console.log("--dry-run 이라 여기서 멈춥니다.");
    return;
  }

  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null, true);
  const folderCache = new Map();

  console.log("");
  for (const item of plan) {
    let parentId = rootId;
    for (const segment of item.to) {
      const cacheKey = `${parentId}/${segment}`;
      if (!folderCache.has(cacheKey)) {
        folderCache.set(cacheKey, await findOrCreateFolder(drive, segment, parentId, true));
      }
      parentId = folderCache.get(cacheKey);
    }

    // 부모만 바꾼다. 파일 ID 가 그대로라 기존 링크가 살아 있다.
    const previousParents = (item.file.parents ?? []).join(",");
    const res = await drive.files.update({
      fileId: item.file.id,
      addParents: parentId,
      removeParents: previousParents,
      fields: "id, name, webViewLink",
    });
    console.log(`  옮김: ${res.data.name}`);
  }

  const folder = await findOrCreateFolder(drive, "자료", rootId, true);
  const link = await drive.files.get({ fileId: folder, fields: "webViewLink" });
  console.log(`\n자료 폴더: ${link.data.webViewLink}`);
}

main().catch((err) => {
  console.error("\n실패:", err.message);
  process.exitCode = 1;
});
