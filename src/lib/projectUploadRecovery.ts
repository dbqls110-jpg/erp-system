import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { findProjectUploadInDrive } from "@/lib/googleDrive";
import { categorizeFileName } from "@/lib/fileCategory";
import { upsertQuoteAmounts } from "@/lib/projectAmounts";
import type { QuoteAnalysis } from "@/lib/quoteParser";

const LEASE_MS = 5 * 60_000;

export async function beginProjectUpload(input: { projectId: string; createdById: string; name: string; mimeType: string; size: number; contentSha256: string }, analysis: QuoteAnalysis | null) {
  return prisma.projectUploadRecovery.create({ data: {
    ...input, id: randomUUID(), leaseUntil: new Date(Date.now() + LEASE_MS),
    applyQuote: !!analysis && analysis.confidence !== "none" && (analysis.revenue !== null || analysis.cost !== null),
    quoteRevenue: analysis?.revenue ?? null, quoteCost: analysis?.cost ?? null,
  } });
}

/** DB commit ambiguity is safe: the durable task is checked again under a project lock. */
export async function finishProjectUpload(id: string, drive: { driveFileId: string; driveUrl: string; category: string | null }) {
  return prisma.$transaction(async tx => {
    const initial = await tx.projectUploadRecovery.findUniqueOrThrow({ where: { id } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.projectId}))`;
    const task = await tx.projectUploadRecovery.findUniqueOrThrow({ where: { id } });
    if (task.status === "completed") return { amountsApplied: task.amountsApplied };
    const existing = await tx.projectFile.findFirst({ where: { projectId: task.projectId, driveFileId: drive.driveFileId } });
    const file = existing ?? await tx.projectFile.create({ data: {
      projectId: task.projectId, name: task.name, mimeType: task.mimeType, size: task.size,
      ...drive, createdAt: task.createdAt,
    } });
    // A delayed older upload must not overwrite a later replacement's amounts.
    const newer = task.applyQuote ? await tx.projectFile.findFirst({ where: {
      projectId: task.projectId, name: task.name, createdAt: { gt: task.createdAt },
    }, select: { id: true } }) : null;
    const amountsApplied = task.applyQuote && !newer;
    if (amountsApplied) await upsertQuoteAmounts(task.projectId, task.name, { revenue: task.quoteRevenue, cost: task.quoteCost }, tx);
    await tx.projectUploadRecovery.update({ where: { id }, data: {
      status: "completed", ...drive, fileId: file.id, amountsApplied,
      leaseToken: null, leaseUntil: null, lastError: newer ? "NEWER_QUOTE_PRESERVED" : null,
    } });
    return { amountsApplied };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function markProjectUploadPending(id: string) {
  // If the DB is temporarily unavailable, the initial durable lease still expires.
  try {
    await prisma.projectUploadRecovery.updateMany({ where: { id, status: { not: "completed" } }, data: {
      status: "pending", leaseToken: null, leaseUntil: null,
      nextAttemptAt: new Date(Date.now() + 60_000), lastError: "UPLOAD_OR_SAVE_FAILED",
    } });
  } catch { console.warn("[project-upload] recovery deferred until database returns"); }
}

/** Never uploads again or deletes Drive files; only attaches an exactly tagged original. */
export async function recoverProjectUploads(projectId?: string) {
  const now = new Date();
  const due = { status: { in: ["uploading", "pending"] }, nextAttemptAt: { lte: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] };
  const tasks = await prisma.projectUploadRecovery.findMany({
    where: { ...due, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "asc" }, take: 5,
  });
  let recovered = 0;
  for (const task of tasks) {
    const token = randomUUID();
    const claimed = await prisma.projectUploadRecovery.updateMany({ where: { id: task.id, ...due }, data: {
      leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 },
    } });
    if (!claimed.count) continue;
    try {
      const file = await findProjectUploadInDrive(task.id);
      if (!file || file.name !== task.name || file.size !== task.size || file.contentSha256 !== task.contentSha256) throw new Error("RECOVERY_NOT_MATCHED");
      await finishProjectUpload(task.id, { driveFileId: file.driveFileId, driveUrl: file.driveUrl, category: categorizeFileName(task.name) });
      recovered++;
    } catch {
      await prisma.projectUploadRecovery.updateMany({ where: { id: task.id, leaseToken: token, status: { not: "completed" } }, data: {
        status: task.attempts + 1 >= 8 ? "needs_attention" : "pending",
        leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** task.attempts) * 60_000),
        lastError: "RECOVERY_RETRY_REQUIRED",
      } });
    }
  }
  return { checked: tasks.length, recovered };
}
