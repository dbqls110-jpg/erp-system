"use server";

import { requireEditAccess } from "@/lib/actionGuards";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive, deleteFileFromDrive } from "@/lib/googleDrive";
import { revalidatePath } from "next/cache";
import { analyzeQuoteFile, type QuoteAnalysis } from "@/lib/quoteParser";
import { isInternalQuoteFileName } from "@/lib/quotePolicy";
import { upsertQuoteAmounts } from "@/lib/projectAmounts";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface ProjectFileUploadResult {
  quoteAnalysis: QuoteAnalysis | null;
  internalQuoteFileName: string | null;
  internalQuoteFileCount: number;
  uploadedFileNames: string[];
  failedFiles: Array<{ name: string; reason: string }>;
  materialOnlyFileNames: string[];
}

function analysisFailure(): QuoteAnalysis {
  return {
    revenue: null,
    cost: null,
    confidence: "none",
    source: "empty",
    note: "견적서를 읽지 못했습니다. 금액을 직접 확인해 주세요.",
    matchedLabels: [],
  };
}

function filesFromFormData(formData: FormData): File[] {
  return formData.getAll("file").filter((entry): entry is File => entry instanceof File);
}

function formatUploadFailure(failedFiles: Array<{ name: string; reason: string }>): string {
  return failedFiles.map(({ name, reason }) => `${name} (${reason})`).join(", ");
}

/** 여러 파일을 독립적으로 처리해 한 파일의 실패가 나머지 업로드를 막지 않게 한다. */
export async function uploadProjectFiles(projectId: string, formData: FormData): Promise<ProjectFileUploadResult> {
  const session = await requireEditAccess("projects");
  if (!session.accessToken) throw new Error("Google Drive 권한이 없습니다. 재로그인 해주세요.");

  const files = filesFromFormData(formData);
  if (files.length === 0) throw new Error("파일을 선택해주세요.");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

  const internalFiles = files.filter((file) => isInternalQuoteFileName(file.name));
  const internalQuoteFile = internalFiles[0] ?? null;
  let quoteAnalysis: QuoteAnalysis | null = null;
  if (internalQuoteFile) {
    try {
      quoteAnalysis = await analyzeQuoteFile(internalQuoteFile);
    } catch {
      quoteAnalysis = analysisFailure();
    }
  }

  const uploadedFileNames: string[] = [];
  const failedFiles: Array<{ name: string; reason: string }> = [];

  for (const file of files) {
    try {
      if (file.size === 0) throw new Error("빈 파일");
      if (file.size > MAX_FILE_SIZE) throw new Error("50MB 초과");

      const buffer = Buffer.from(await file.arrayBuffer());
      const { driveFileId, driveUrl, category } = await uploadFileToDrive(
        session.accessToken,
        { buffer, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size },
        { id: project.id, name: project.name, createdAt: project.createdAt }
      );

      await prisma.projectFile.create({
        data: {
          projectId,
          driveFileId,
          category,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          driveUrl,
          size: file.size,
        },
      });
      uploadedFileNames.push(file.name);
    } catch (error) {
      failedFiles.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    }
  }

  if (quoteAnalysis && (quoteAnalysis.revenue !== null || quoteAnalysis.cost !== null)) {
    await upsertQuoteAmounts(projectId, internalQuoteFile!.name, quoteAnalysis);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");

  return {
    quoteAnalysis,
    internalQuoteFileName: internalQuoteFile?.name ?? null,
    internalQuoteFileCount: internalFiles.length,
    uploadedFileNames,
    failedFiles,
    materialOnlyFileNames: uploadedFileNames.filter((file) => !isInternalQuoteFileName(file)),
  };
}

export async function uploadProjectFile(projectId: string, formData: FormData) {
  const result = await uploadProjectFiles(projectId, formData);
  if (result.failedFiles.length > 0) {
    throw new Error(`파일 업로드 실패: ${formatUploadFailure(result.failedFiles)}`);
  }
  return result;
}

export async function deleteProjectFile(fileId: string, projectId: string) {
  const session = await requireEditAccess("projects");
  if (!session.accessToken) throw new Error("Google Drive 권한이 없습니다. 재로그인 해주세요.");

  const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error("파일을 찾을 수 없습니다.");

  await deleteFileFromDrive(session.accessToken, file.driveFileId);
  await prisma.projectFile.delete({ where: { id: fileId } });

  revalidatePath(`/projects/${projectId}`);
}
