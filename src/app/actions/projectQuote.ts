"use server";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireEditAccess } from "@/lib/actionGuards";
import { downloadProjectQuote } from "@/lib/googleDrive";
import { analyzeQuoteFile } from "@/lib/quoteParser";
import { isInternalQuoteFileName } from "@/lib/quotePolicy";
import { upsertQuoteAmounts } from "@/lib/projectAmounts";
import { revalidatePath } from "next/cache";

async function currentQuote(fileId: string, projectId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const file = await db.projectFile.findUnique({ where: { id: fileId } });
  if (!file || file.projectId !== projectId || !isInternalQuoteFileName(file.name)) throw new Error("해당 프로젝트의 내부용 견적서를 선택해 주세요.");
  const latest = await db.projectFile.findFirst({ where: { projectId, name: file.name }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  if (latest?.id !== file.id) throw new Error("같은 이름의 최신 견적서로 재분석해 주세요.");
  return file;
}

async function amountSnapshot(projectId: string, name: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const rows = await db.projectAmount.findMany({ where: { projectId, sourceFileName: name, label: "견적서" },
    select: { id: true, kind: true, amount: true, updatedAt: true }, orderBy: { id: "asc" } });
  const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  const sum = (kind: string) => { const matches = rows.filter(row => row.kind === kind); return matches.length ? matches.reduce((total, row) => total + row.amount, 0) : null; };
  return { digest, revenue: sum("revenue"), cost: sum("cost") };
}

async function analyzeSavedQuote(file: Awaited<ReturnType<typeof currentQuote>>) {
  const bytes = await downloadProjectQuote(file.driveFileId);
  const analysis = await analyzeQuoteFile(new File([new Uint8Array(bytes)], file.name, { type: file.mimeType }));
  return { analysis, fileDigest: createHash("sha256").update(bytes).digest("hex") };
}

export async function previewProjectQuote(fileId: string, projectId: string) {
  await requireEditAccess("projects");
  const file = await currentQuote(fileId, projectId);
  const [parsed, before] = await Promise.all([analyzeSavedQuote(file), amountSnapshot(projectId, file.name)]);
  return { ...parsed, before, fileId, fileName: file.name };
}

export async function applyProjectQuote(fileId: string, projectId: string, fileDigest: string, amountsDigest: string) {
  await requireEditAccess("projects");
  if (![fileDigest, amountsDigest].every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error("재분석 미리보기를 다시 열어 주세요.");
  const file = await currentQuote(fileId, projectId);
  // Never accept amounts from the browser; re-read the actual original.
  const parsed = await analyzeSavedQuote(file);
  if (parsed.fileDigest !== fileDigest) throw new Error("원본 파일이 변경됐습니다. 미리보기를 다시 확인해 주세요.");
  if (parsed.analysis.confidence === "none" || (parsed.analysis.revenue === null && parsed.analysis.cost === null)) throw new Error("금액을 판독하지 못해 기존 금액을 유지합니다.");
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
    await currentQuote(fileId, projectId, tx);
    await tx.$queryRaw`SELECT id FROM project_amounts WHERE "projectId" = ${projectId} AND "sourceFileName" = ${file.name} AND label = '견적서' FOR UPDATE`;
    const before = await amountSnapshot(projectId, file.name, tx);
    if (before.digest !== amountsDigest) throw new Error("금액이 다른 작업에서 변경됐습니다. 미리보기를 다시 확인해 주세요.");
    await upsertQuoteAmounts(projectId, file.name, parsed.analysis, tx);
  }, { maxWait: 10_000, timeout: 30_000 });
  for (const path of [`/projects/${projectId}`, "/projects", "/projects/stats", "/company-finance", "/finance"]) revalidatePath(path);
  return { applied: true };
}
