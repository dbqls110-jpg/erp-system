import { google } from "googleapis";
import { Readable } from "stream";
import { categorizeFileName } from "@/lib/fileCategory";

const ROOT_FOLDER_NAME = "천우영 시스템";

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string
): Promise<string> {
  const query = [
    `name = '${name}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    parentId ? `'${parentId}' in parents` : `'root' in parents`,
  ].join(" and ");

  const res = await drive.files.list({
    q: query,
    fields: "files(id)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });

  return created.data.id!;
}

function formatMonthFolder(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}년 ${month}월`;
}

export async function uploadFileToDrive(
  accessToken: string,
  file: { buffer: Buffer; name: string; mimeType: string; size: number },
  project: { id: string; name: string; createdAt: Date }
): Promise<{ driveFileId: string; driveUrl: string; category: string | null }> {
  const drive = getDriveClient(accessToken);

  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const monthFolder = formatMonthFolder(project.createdAt);
  const monthId = await findOrCreateFolder(drive, monthFolder, rootId);
  const projectFolderId = await findOrCreateFolder(drive, project.name, monthId);

  // 2차 분류: 파일명으로 종류를 알면 그 하위 폴더에, 모르면 프로젝트 폴더에 그대로 둔다.
  const category = categorizeFileName(file.name);
  const targetFolderId = category
    ? await findOrCreateFolder(drive, category, projectFolderId)
    : projectFolderId;

  const res = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [targetFolderId],
    },
    media: {
      mimeType: file.mimeType,
      body: Readable.from(file.buffer),
    },
    fields: "id, webViewLink",
  });

  return {
    driveFileId: res.data.id!,
    driveUrl: res.data.webViewLink!,
    category,
  };
}

export async function deleteFileFromDrive(
  accessToken: string,
  driveFileId: string
): Promise<void> {
  const drive = getDriveClient(accessToken);
  await drive.files.delete({ fileId: driveFileId });
}
