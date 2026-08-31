import { google } from "googleapis";
import { Readable } from "stream";
import { categorizeFileName } from "@/lib/fileCategory";
import { makeDriveClientAsOwner } from "@/lib/googleClient";

const ROOT_FOLDER_NAME = "천우영 시스템";
export const MESSENGER_FOLDER_NAME = "메신저";
export const MAX_MESSENGER_FILE_SIZE = 50 * 1024 * 1024;

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
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = [
    `name = '${escapedName}'`,
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

type DriveUploadFile = {
  buffer: Buffer;
  name: string;
  mimeType: string;
  size: number;
};

type MessengerDriveFile = {
  driveFileId: string;
  driveUrl: string;
  name: string;
  mimeType: string;
  size: number;
};

async function moveDriveFileToFolder(
  drive: ReturnType<typeof google.drive>,
  driveFileId: string,
  targetFolderId: string,
): Promise<{ name: string; driveUrl: string }> {
  const current = await drive.files.get({
    fileId: driveFileId,
    fields: "id,name,parents,trashed,webViewLink",
  });

  if (!current.data.id || current.data.trashed) {
    throw new Error("이 첨부파일을 Drive에서 찾을 수 없습니다.");
  }

  const updated = await drive.files.update({
    fileId: driveFileId,
    addParents: targetFolderId,
    removeParents: (current.data.parents ?? []).filter(Boolean).join(",") || undefined,
    fields: "id,name,webViewLink",
  });

  const driveUrl = updated.data.webViewLink ?? current.data.webViewLink;
  if (!updated.data.id || !driveUrl) {
    throw new Error("Drive 파일 링크를 확인하지 못했습니다.");
  }

  return { name: updated.data.name ?? current.data.name ?? "첨부파일", driveUrl };
}

/** 메신저 첨부파일을 회사 소유 Drive의 천우영 시스템/메신저에 저장한다. */
export async function uploadMessengerFile(file: DriveUploadFile): Promise<MessengerDriveFile> {
  const drive = await makeDriveClientAsOwner();
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const messengerId = await findOrCreateFolder(drive, MESSENGER_FOLDER_NAME, rootId);

  const created = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [messengerId],
    },
    media: {
      mimeType: file.mimeType,
      body: Readable.from(file.buffer),
    },
    fields: "id,name,mimeType,size,webViewLink",
  });

  if (!created.data.id || !created.data.webViewLink) {
    throw new Error("Drive에 파일을 저장했지만 파일 링크를 확인하지 못했습니다.");
  }

  return {
    driveFileId: created.data.id,
    driveUrl: created.data.webViewLink,
    name: created.data.name ?? file.name,
    mimeType: created.data.mimeType ?? file.mimeType,
    size: file.size,
  };
}

/** 메신저 업로드가 DB 저장 전에 실패했을 때 남은 Drive 파일을 정리한다. */
export async function deleteDriveFileAsOwner(driveFileId: string): Promise<void> {
  const drive = await makeDriveClientAsOwner();
  await drive.files.delete({ fileId: driveFileId });
}

/** 첨부파일을 프로젝트의 기존 Drive 폴더 규칙으로 이동한다. */
export async function moveMessengerFileToProject(
  driveFileId: string,
  project: { name: string; createdAt: Date },
  category?: string,
): Promise<{ name: string; driveUrl: string; folderPath: string }> {
  const drive = await makeDriveClientAsOwner();
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const monthFolder = formatMonthFolder(project.createdAt);
  const monthId = await findOrCreateFolder(drive, monthFolder, rootId);
  const projectFolderId = await findOrCreateFolder(drive, project.name, monthId);
  const targetFolderId = category
    ? await findOrCreateFolder(drive, category, projectFolderId)
    : projectFolderId;
  const moved = await moveDriveFileToFolder(drive, driveFileId, targetFolderId);

  return {
    ...moved,
    folderPath: `${ROOT_FOLDER_NAME}/${monthFolder}/${project.name}${category ? `/${category}` : ""}`,
  };
}

/** 프로젝트를 지정하지 않고 메신저 안의 분류 폴더(예: 견적서)로 이동한다. */
export async function moveMessengerFileToCategory(
  driveFileId: string,
  category: string,
): Promise<{ name: string; driveUrl: string; folderPath: string }> {
  const drive = await makeDriveClientAsOwner();
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const messengerId = await findOrCreateFolder(drive, MESSENGER_FOLDER_NAME, rootId);
  const categoryId = await findOrCreateFolder(drive, category, messengerId);
  const moved = await moveDriveFileToFolder(drive, driveFileId, categoryId);

  return { ...moved, folderPath: `${ROOT_FOLDER_NAME}/${MESSENGER_FOLDER_NAME}/${category}` };
}
