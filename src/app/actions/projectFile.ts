"use server";

import { requireEditAccess } from "@/lib/actionGuards";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive, deleteFileFromDrive } from "@/lib/googleDrive";
import { revalidatePath } from "next/cache";
import { analyzeQuoteFile, type QuoteAnalysis } from "@/lib/quoteParser";
import { isInternalQuoteFileName } from "@/lib/quotePolicy";
import { deleteQuoteAmounts } from "@/lib/projectAmounts";
import { beginProjectUpload, finishProjectUpload, markProjectUploadPending, recoverProjectUploads } from "@/lib/projectUploadRecovery";
import { createHash } from "node:crypto";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface ProjectFileUploadResult {
  quoteAnalysis: QuoteAnalysis | null;
  internalQuoteFileName: string | null;
  internalQuoteFileCount: number;
  quoteAmountsApplied: boolean;
  uploadedFileNames: string[];
  failedFiles: Array<{ name: string; reason: string }>;
  pendingRecoveryNames: string[];
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
  let quoteAmountsApplied = false;
  const pendingRecoveryNames: string[] = [];

  for (const file of files) {
    let recoveryId: string | null = null;
    try {
      if (file.size === 0) throw new Error("빈 파일");
      if (file.size > MAX_FILE_SIZE) throw new Error("50MB 초과");

      const buffer = Buffer.from(await file.arrayBuffer());
      const task = await beginProjectUpload({ projectId, createdById: session.user.id, name: file.name,
        mimeType: file.type || "application/octet-stream", size: file.size,
        contentSha256: createHash("sha256").update(buffer).digest("hex") }, file === internalQuoteFile ? quoteAnalysis : null);
      recoveryId = task.id;
      const { driveFileId, driveUrl, category } = await uploadFileToDrive(
        { buffer, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, recoveryKey: task.id },
        { id: project.id, name: project.name, createdAt: project.createdAt }
      );

      const saved = await finishProjectUpload(task.id, { driveFileId, driveUrl, category });
      if (saved.amountsApplied) quoteAmountsApplied = true;
      uploadedFileNames.push(file.name);
    } catch (error) {
      if (recoveryId) { await markProjectUploadPending(recoveryId); pendingRecoveryNames.push(file.name); }
      failedFiles.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/projects/stats");
  revalidatePath("/company-finance");
  revalidatePath("/finance");

  return {
    quoteAnalysis,
    internalQuoteFileName: internalQuoteFile?.name ?? null,
    internalQuoteFileCount: internalFiles.length,
    quoteAmountsApplied,
    uploadedFileNames,
    failedFiles,
    pendingRecoveryNames,
    materialOnlyFileNames: uploadedFileNames.filter((file) => !isInternalQuoteFileName(file)),
  };
}

export async function retryProjectUploads(projectId: string) {
  await requireEditAccess("projects");
  const now = new Date();
  await prisma.projectUploadRecovery.updateMany({ where: { projectId, status: "pending",
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { nextAttemptAt: now } });
  const result = await recoverProjectUploads(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/company-finance");
  revalidatePath("/projects");
  revalidatePath("/projects/stats");
  return result;
}

export async function uploadProjectFile(projectId: string, formData: FormData) {
  const result = await uploadProjectFiles(projectId, formData);
  if (result.failedFiles.length > 0) {
    throw new Error(`파일 업로드 실패: ${formatUploadFailure(result.failedFiles)}`);
  }
  return result;
}

export async function deleteProjectFile(fileId: string, projectId: string) {
  await requireEditAccess("projects");

  const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!file) { revalidatePath(`/projects/${projectId}`); return; }
  if (file.projectId !== projectId) throw new Error("프로젝트 파일이 일치하지 않습니다.");

  await deleteFileFromDrive(file.driveFileId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
    const current = await tx.projectFile.findUnique({ where: { id: fileId } });
    if (!current) return; // A simultaneous request already removed it.
    await tx.projectFile.delete({ where: { id: fileId } });
    if (isInternalQuoteFileName(file.name)) {
      const remainingQuote = await tx.projectFile.findFirst({ where: { projectId, name: file.name }, select: { id: true } });
      if (!remainingQuote) await deleteQuoteAmounts(projectId, file.name, tx);
    }
  }, { maxWait: 10_000, timeout: 30_000 });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/projects/stats");
  revalidatePath("/company-finance");
  revalidatePath("/finance");
}
