import type { Prisma } from "@prisma/client";
import type { QuoteAnalysis } from "@/lib/quoteParser";
import { prisma } from "@/lib/prisma";

export type ProjectAmountKind = "revenue" | "cost";

type ProjectAmountDb = typeof prisma | Prisma.TransactionClient;

/**
 * project_amounts 를 기준으로 프로젝트의 호환용 집계 칸을 갱신한다.
 *
 * 이 함수만 projects.revenue/cost 를 쓴다. 매출·매입 건을 만드는 모든 경로는
 * 원본 건을 먼저 저장한 뒤 이 함수를 호출해야 한다.
 */
export async function recalculateProjectTotals(
  projectId: string,
  db: ProjectAmountDb = prisma,
) {
  const amounts = await db.projectAmount.findMany({
    where: { projectId },
    select: { kind: true, amount: true },
  });

  let revenue: number | null = null;
  let cost: number | null = null;
  for (const amount of amounts) {
    if (amount.kind === "revenue") revenue = (revenue ?? 0) + amount.amount;
    if (amount.kind === "cost") cost = (cost ?? 0) + amount.amount;
  }

  await db.project.update({
    where: { id: projectId },
    data: { revenue, cost },
  });

  return { revenue, cost };
}

/** 견적서 한 파일의 매출·매입 건을 파일명과 구분별로 갱신한다. */
export async function upsertQuoteAmounts(
  projectId: string,
  sourceFileName: string,
  analysis: Pick<QuoteAnalysis, "revenue" | "cost">,
  db: ProjectAmountDb = prisma,
) {
  const values: Array<{ kind: ProjectAmountKind; amount: number | null }> = [
    { kind: "revenue", amount: analysis.revenue },
    { kind: "cost", amount: analysis.cost },
  ];
  let changed = false;

  for (const { kind, amount } of values) {
    if (amount === null) continue;

    const existing = await db.projectAmount.findFirst({
      where: { projectId, kind, sourceFileName },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (existing) {
      await db.projectAmount.update({
        where: { id: existing.id },
        data: { amount, label: "견적서" },
      });
    } else {
      await db.projectAmount.create({
        data: { projectId, kind, amount, label: "견적서", sourceFileName },
      });
    }
    changed = true;
  }

  return changed ? recalculateProjectTotals(projectId, db) : null;
}

/** 기존 API의 revenue/cost 입력을 호환용 "기본" 건으로 반영한다. */
export async function setDefaultProjectAmount(
  projectId: string,
  kind: ProjectAmountKind,
  amount: number | null,
  db: ProjectAmountDb = prisma,
) {
  const existing = await db.projectAmount.findFirst({
    where: { projectId, kind, label: "기본", sourceFileName: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (amount === null) {
    if (existing) await db.projectAmount.delete({ where: { id: existing.id } });
  } else if (existing) {
    await db.projectAmount.update({ where: { id: existing.id }, data: { amount } });
  } else {
    await db.projectAmount.create({
      data: { projectId, kind, amount, label: "기본" },
    });
  }

  return recalculateProjectTotals(projectId, db);
}
