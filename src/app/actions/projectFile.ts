"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive, deleteFileFromDrive } from "@/lib/googleDrive";
import { revalidatePath } from "next/cache";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function uploadProjectFile(projectId: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!session.accessToken) throw new Error("Google Drive 권한이 없습니다. 재로그인 해주세요.");

  const file = formData.get("file") as File;
  if (!file || file.size === 0) throw new Error("파일을 선택해주세요.");
  if (file.size > MAX_FILE_SIZE) throw new Error("파일 크기는 50MB 이하여야 합니다.");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

  const buffer = Buffer.from(await file.arrayBuffer());

  const { driveFileId, driveUrl } = await uploadFileToDrive(
    session.accessToken,
    { buffer, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size },
    { id: project.id, name: project.name, createdAt: project.createdAt }
  );

  await prisma.projectFile.create({
    data: {
      projectId,
      driveFileId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      driveUrl,
      size: file.size,
    },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectFile(fileId: string, projectId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!session.accessToken) throw new Error("Google Drive 권한이 없습니다. 재로그인 해주세요.");

  const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error("파일을 찾을 수 없습니다.");

  await deleteFileFromDrive(session.accessToken, file.driveFileId);
  await prisma.projectFile.delete({ where: { id: fileId } });

  revalidatePath(`/projects/${projectId}`);
}
