"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requireSessionUser } from "@/lib/actionGuards";
import { canAccessMenu } from "@/lib/permissions";
import { canManageCostPayments, parseCostPayment, type CostPaymentInput } from "@/lib/projectCostPayments";
import { currentKoreanDateKey } from "@/lib/dateFormat";

async function requirePaymentStaff() {
  const session = await requireSessionUser();
  if (!canManageCostPayments(session.user) || !(await canAccessMenu(session.user.id, "projects"))) {
    throw new Error("프로젝트를 열람할 수 있는 내부 직원만 지급 기록을 수정할 수 있습니다.");
  }
  return session.user.id;
}

async function lockCost(tx: Prisma.TransactionClient, projectId: string, amountId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "project_amounts" WHERE "id" = ${amountId} AND "projectId" = ${projectId} AND "kind" = 'cost' FOR UPDATE
  `;
  if (!rows.length) throw new Error("해당 프로젝트의 매입 건을 찾을 수 없습니다.");
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/company-finance");
}

export async function payProjectCostToday(projectId: string, amountId: string) {
  const actorId = await requirePaymentStaff();
  const paidDate = currentKoreanDateKey();
  const result = await prisma.$transaction(async tx => {
    await lockCost(tx, projectId, amountId);
    const item = await tx.projectAmount.findUniqueOrThrow({ where: { id: amountId }, include: { payments: { select: { amount: true } } } });
    if (item.costSettled) return { amount: 0, paidDate: null };
    const alreadyPaid = item.payments.reduce((sum, p) => sum + p.amount, 0);
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0 || !Number.isSafeInteger(alreadyPaid) || alreadyPaid < 0) {
      throw new Error("예정 매입액과 기존 지급액을 먼저 확인해 주세요.");
    }
    const remaining = Math.max(0, item.amount - alreadyPaid);
    if (remaining > 0) {
      await tx.projectCostPayment.create({ data: {
        id: randomUUID(), projectAmountId: amountId, amount: remaining, paidDate,
        memo: "오늘 지급 완료로 자동 기록", createdById: actorId, updatedById: actorId,
      } });
    }
    await tx.projectAmount.update({ where: { id: amountId }, data: { costSettled: true } });
    return { amount: remaining, paidDate: remaining > 0 ? paidDate : null };
  });
  refresh(projectId);
  return result;
}

export async function saveProjectCostPayment(projectId: string, amountId: string, input: CostPaymentInput) {
  const actorId = await requirePaymentStaff();
  const { settle, ...payment } = parseCostPayment(input);
  await prisma.$transaction(async tx => {
    await lockCost(tx, projectId, amountId);
    const existing = await tx.projectCostPayment.findUnique({ where: { id: payment.id } });
    if (existing && existing.projectAmountId !== amountId) throw new Error("지급 기록을 찾을 수 없습니다.");
    const all = await tx.projectCostPayment.findMany({ where: { projectAmountId: amountId }, select: { id: true, amount: true } });
    const total = all.filter(p => p.id !== payment.id).reduce((sum, p) => sum + p.amount, payment.amount);
    if (!Number.isSafeInteger(total)) throw new Error("누적 지급액이 지원 범위를 초과했습니다.");
    await tx.projectCostPayment.upsert({
      where: { id: payment.id },
      create: { ...payment, projectAmountId: amountId, createdById: actorId, updatedById: actorId },
      update: { amount: payment.amount, paidDate: payment.paidDate, memo: payment.memo, updatedById: actorId },
    });
    await tx.projectAmount.update({ where: { id: amountId }, data: { costSettled: settle } });
  });
  refresh(projectId);
}

export async function deleteProjectCostPayment(projectId: string, amountId: string, paymentId: string) {
  await requirePaymentStaff();
  await prisma.$transaction(async tx => {
    await lockCost(tx, projectId, amountId);
    const deleted = await tx.projectCostPayment.deleteMany({ where: { id: paymentId, projectAmountId: amountId } });
    if (!deleted.count) throw new Error("지급 기록을 찾을 수 없습니다.");
    // 지급 취소 뒤에는 정산도 다시 확인해야 한다.
    await tx.projectAmount.update({ where: { id: amountId }, data: { costSettled: false } });
  });
  refresh(projectId);
}

export async function setProjectCostSettled(projectId: string, amountId: string, settled: boolean) {
  await requirePaymentStaff();
  if (typeof settled !== "boolean") throw new Error("정산 완료 여부를 확인해 주세요.");
  await prisma.$transaction(async tx => {
    await lockCost(tx, projectId, amountId);
    if (settled && !(await tx.projectCostPayment.count({ where: { projectAmountId: amountId } }))) {
      throw new Error("실제 지급 기록을 먼저 등록해 주세요.");
    }
    await tx.projectAmount.update({ where: { id: amountId }, data: { costSettled: settled } });
  });
  refresh(projectId);
}
