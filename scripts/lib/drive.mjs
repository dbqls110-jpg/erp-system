/**
 * 스크립트들이 같이 쓰는 구글 드라이브 접속 도구.
 *
 * 토큰을 찾는 순서와 폴더를 찾는 방식이 스크립트마다 복사돼 있었다. 한 곳만 고치면
 * 나머지가 조용히 예전 방식으로 남아, 백업은 되는데 적재는 안 되는 식으로 갈린다.
 */
import crypto from "node:crypto";
import { google } from "googleapis";

/** 회사 드라이브의 최상위 폴더 이름. 스크립트마다 다르게 적으면 폴더가 두 벌 생긴다. */
export const ROOT_FOLDER_NAME = "천우영 시스템";
export const VENUE_FOLDER_NAME = "공간 DB";
export const SNAPSHOT_FOLDER_NAME = "원본 스냅샷";

/**
 * 앱과 같은 순서로 토큰을 찾는다.
 *
 * DB 에 저장된 것을 먼저 보고 없으면 env 로 넘어간다. env 에는 만료된 값이 남아
 * 있을 수 있어 그걸 먼저 보면 인증이 실패한다.
 */
export async function getRefreshToken() {
  const encKey =
    process.env.DRIVE_TOKEN_ENC_KEY ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

  if (encKey) {
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
      if (enc) {
        const key = crypto.createHash("sha256").update(encKey).digest();
        const buf = Buffer.from(enc, "base64");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
        decipher.setAuthTag(buf.subarray(12, 28));
        return Buffer.concat([
          decipher.update(buf.subarray(28)),
          decipher.final(),
        ]).toString("utf8");
      }
    } catch {
      // 복호화 실패나 DB 접속 실패는 아래 env 폴백으로 넘긴다.
    } finally {
      await prisma.$disconnect();
    }
  }

  const envToken = process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  if (envToken) return envToken;
  throw new Error("Drive refresh token 을 찾지 못했습니다. DRIVE_TOKEN_ENC_KEY 를 확인하세요.");
}

export async function makeDriveClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: await getRefreshToken() });
  return google.drive({ version: "v3", auth: oauth2 });
}

/** 드라이브 검색어에 들어가는 이름을 감싼다. 작은따옴표가 든 이름이 질의를 깨뜨린다. */
const quote = (name) => name.replace(/'/g, "\'");

/** 이름이 같은 폴더가 있으면 재사용한다. 실행할 때마다 폴더가 늘어나면 안 된다. */
export async function findOrCreateFolder(drive, name, parentId) {
  const found = await findFolder(drive, name, parentId);
  if (found) return found;

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

/** 폴더를 찾기만 한다. 읽기만 하는 스크립트가 폴더를 만들어 버리면 안 된다. */
export async function findFolder(drive, name, parentId) {
  const q = [
    `name = '${quote(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" });
  return res.data.files?.[0]?.id ?? null;
}

/** 폴더 안의 하위 폴더를 이름 내림차순으로. 스냅샷 폴더가 날짜 이름이라 최신이 앞에 온다. */
export async function listSubfolders(drive, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    orderBy: "name desc",
    pageSize: 200,
    spaces: "drive",
  });
  return res.data.files ?? [];
}

/** 폴더 안에서 이름이 정확히 같은 파일 하나. 없으면 null. */
export async function findFileInFolder(drive, name, parentId) {
  const res = await drive.files.list({
    q: `name = '${quote(name)}' and '${parentId}' in parents and trashed = false`,
    fields: "files(id, name, size, modifiedTime)",
    spaces: "drive",
  });
  return res.data.files?.[0] ?? null;
}

/**
 * 파일 내용을 문자열로 받는다.
 *
 * 스트림으로 받아 파일에 쓰지 않는 것은, 적재 스크립트가 임시 파일을 남기면
 * 그 임시 파일이 다음 실행의 원본으로 오해받기 때문이다. 메모리에만 둔다.
 */
export async function downloadText(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data).toString("utf8");
}
