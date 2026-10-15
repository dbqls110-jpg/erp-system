import { google } from "googleapis";
import { Readable } from "stream";
import { categorizeFileName } from "@/lib/fileCategory";
import { isInvalidGrantError, makeDriveClientAsOwner } from "@/lib/googleClient";

const ROOT_FOLDER_NAME = "천우영 시스템";
const SPACE_REGISTRATION_ROOT_FOLDER_NAME = "천우영 프로젝트";
const SPACE_REGISTRATION_FOLDER_NAME = "공간 등록";
export const MESSENGER_FOLDER_NAME = "메신저";
export const MAX_MESSENGER_FILE_SIZE = 50 * 1024 * 1024;

const OWNER_DRIVE_REAUTH_MESSAGE =
  "Google Drive 소유자 인증이 만료됐습니다. 관리자에게 /api/admin/drive-setup 에서 재인증해 주세요.";

function normalizeOwnerDriveError(error: unknown): Error {
  if (isInvalidGrantError(error)) return new Error(OWNER_DRIVE_REAUTH_MESSAGE);
  if (error instanceof Error) return error;
  return new Error("Google Drive 작업에 실패했습니다.");
}

async function withOwnerDrive<T>(
  operation: (drive: ReturnType<typeof google.drive>) => Promise<T>,
): Promise<T> {
  try {
    const drive = await makeDriveClientAsOwner();
    return await operation(drive);
  } catch (error) {
    throw normalizeOwnerDriveError(error);
  }
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
  file: { buffer: Buffer; name: string; mimeType: string; size: number; recoveryKey?: string },
  project: { id: string; name: string; createdAt: Date }
): Promise<{ driveFileId: string; driveUrl: string; category: string | null }> {
  return withOwnerDrive(async (drive) => {
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
        appProperties: file.recoveryKey ? { erpUploadRecoveryId: file.recoveryKey } : undefined,
      },
      media: {
        mimeType: file.mimeType,
        body: Readable.from(file.buffer),
      },
      fields: "id, webViewLink",
    });

    if (!res.data.id) throw new Error("Drive 업로드 응답에서 파일 ID를 확인하지 못했습니다.");
    return {
      driveFileId: res.data.id,
      driveUrl: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view`,
      category,
    };
  });
}

/** Only tagged uploads created by this application are eligible for recovery. */
export async function findProjectUploadInDrive(recoveryKey: string) {
  if (!/^[a-f0-9-]{36}$/i.test(recoveryKey)) throw new Error("잘못된 복구 식별자입니다.");
  return withOwnerDrive(async drive => {
    const result = await drive.files.list({
      q: `trashed = false and appProperties has { key='erpUploadRecoveryId' and value='${recoveryKey}' }`,
      fields: "files(id,name,mimeType,size,sha256Checksum,webViewLink)", pageSize: 2,
    });
    const files = result.data.files ?? [];
    if (files.length > 1) throw new Error("RECOVERY_AMBIGUOUS");
    const file = files[0];
    if (!file?.id) return null;
    return { driveFileId: file.id, driveUrl: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
      name: file.name, size: Number(file.size), mimeType: file.mimeType, contentSha256: file.sha256Checksum };
  });
}

export async function downloadProjectQuote(driveFileId: string): Promise<Buffer> {
  return withOwnerDrive(async drive => {
    const metadata = await drive.files.get({ fileId: driveFileId, fields: "size,mimeType,trashed" });
    if (metadata.data.trashed || !metadata.data.size || Number(metadata.data.size) > 10 * 1024 * 1024) {
      throw new Error("재분석은 10MB 이하의 원본 견적서만 지원합니다.");
    }
    const result = await drive.files.get({ fileId: driveFileId, alt: "media" }, { responseType: "stream" });
    const stream = result.data as unknown as Readable;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 10 * 1024 * 1024) { stream.destroy(); throw new Error("견적서가 10MB를 초과합니다."); }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  });
}

export async function deleteFileFromDrive(
  driveFileId: string
): Promise<void> {
  await withOwnerDrive(async (drive) => {
    try { await drive.files.delete({ fileId: driveFileId }); }
    catch (error) {
      // A retry after successful deletion (or manual deletion in Drive) must still
      // remove the ERP metadata. Authentication/permission errors remain failures.
      const status = error && typeof error === "object"
        ? (error as { response?: { status?: number } }).response?.status : undefined;
      if (status !== 404) throw error;
    }
  });
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
  return withOwnerDrive(async (drive) => {
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
  });
}

/** 메신저 업로드가 DB 저장 전에 실패했을 때 남은 Drive 파일을 정리한다. */
/** 첨부 원본을 대표 계정 권한으로 읽어 웹 스트림으로 돌려준다. 말풍선 안 이미지 표시용. */
export async function streamMessengerFile(driveFileId: string): Promise<ReadableStream<Uint8Array>> {
  return withOwnerDrive(async (drive) => {
    const res = await drive.files.get({ fileId: driveFileId, alt: "media" }, { responseType: "stream" });
    return Readable.toWeb(res.data as Readable) as ReadableStream<Uint8Array>;
  });
}

export async function deleteDriveFileAsOwner(driveFileId: string): Promise<void> {
  await withOwnerDrive((drive) => drive.files.delete({ fileId: driveFileId }).then(() => undefined));
}

/** 첨부파일을 프로젝트의 기존 Drive 폴더 규칙으로 이동한다. */
export async function moveMessengerFileToProject(
  driveFileId: string,
  project: { name: string; createdAt: Date },
  category?: string,
): Promise<{ name: string; driveUrl: string; folderPath: string }> {
  return withOwnerDrive(async (drive) => {
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
  });
}

/** 프로젝트를 지정하지 않고 메신저 안의 분류 폴더(예: 견적서)로 이동한다. */
export async function moveMessengerFileToCategory(
  driveFileId: string,
  category: string,
): Promise<{ name: string; driveUrl: string; folderPath: string }> {
  return withOwnerDrive(async (drive) => {
    const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
    const messengerId = await findOrCreateFolder(drive, MESSENGER_FOLDER_NAME, rootId);
    const categoryId = await findOrCreateFolder(drive, category, messengerId);
    const moved = await moveDriveFileToFolder(drive, driveFileId, categoryId);

    return { ...moved, folderPath: `${ROOT_FOLDER_NAME}/${MESSENGER_FOLDER_NAME}/${category}` };
  });
}

type SpaceRegistrationFolder = {
  folderId: string;
  folderPath: string;
  folderUrl: string;
};

async function ensureSpaceRegistrationFolderWithDrive(
  drive: ReturnType<typeof google.drive>,
  spaceCode: string,
  spaceName: string,
): Promise<SpaceRegistrationFolder> {
  const rootId = await findOrCreateFolder(drive, SPACE_REGISTRATION_ROOT_FOLDER_NAME);
  const registrationRootId = await findOrCreateFolder(drive, SPACE_REGISTRATION_FOLDER_NAME, rootId);
  const folderName = `${spaceCode} ${spaceName.trim()}`.trim();
  const folderId = await findOrCreateFolder(drive, folderName, registrationRootId);

  return {
    folderId,
    folderPath: `${SPACE_REGISTRATION_ROOT_FOLDER_NAME}/${SPACE_REGISTRATION_FOLDER_NAME}/${folderName}`,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
  };
}

/** 호스트 등록 공간 코드에 맞는 공간 등록 폴더를 만들고 링크를 반환한다. */
export async function ensureSpaceRegistrationFolder(
  spaceCode: string,
  spaceName: string,
): Promise<Omit<SpaceRegistrationFolder, "folderId">> {
  return withOwnerDrive(async (drive) => {
    const folder = await ensureSpaceRegistrationFolderWithDrive(drive, spaceCode, spaceName);
    return { folderPath: folder.folderPath, folderUrl: folder.folderUrl };
  });
}

/** 공간등록 접수 사진을 호스트 등록 공간 코드 폴더로 이동한다. */
export async function moveMessengerFileToSpaceRegistration(
  driveFileId: string,
  spaceCode: string,
  spaceName: string,
): Promise<{ name: string; driveUrl: string; folderPath: string; folderUrl: string }> {
  const result = await moveMessengerFilesToSpaceRegistration([driveFileId], spaceCode, spaceName);
  const moved = result.files[0];
  if (!moved) throw new Error("공간 사진을 Drive 폴더로 이동하지 못했습니다.");
  return { ...moved, folderPath: result.folderPath, folderUrl: result.folderUrl };
}

/** 같은 공간에 첨부된 파일은 폴더 탐색을 한 번만 한 뒤 함께 이동한다. */
export async function moveMessengerFilesToSpaceRegistration(
  driveFileIds: readonly string[],
  spaceCode: string,
  spaceName: string,
): Promise<{
  files: Array<{ name: string; driveUrl: string }>;
  folderPath: string;
  folderUrl: string;
}> {
  return withOwnerDrive(async (drive) => {
    const folder = await ensureSpaceRegistrationFolderWithDrive(drive, spaceCode, spaceName);
    const files = await Promise.all(
      [...new Set(driveFileIds.filter(Boolean))].map((driveFileId) =>
        moveDriveFileToFolder(drive, driveFileId, folder.folderId),
      ),
    );
    return { files, folderPath: folder.folderPath, folderUrl: folder.folderUrl };
  });
}
