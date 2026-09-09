"use server";

import { revalidatePath } from "next/cache";
import { requireEditAccess } from "@/lib/actionGuards";
import { prisma } from "@/lib/prisma";
import {
  recalculateProjectTotals,
  type ProjectAmountKind,
} from "@/lib/projectAmounts";

export interface ProjectAmountInput {
  kind: ProjectAmountKind;
  amount: number;
  label?: string;
  memo?: string;
}

function parseKind(value: unknown): ProjectAmountKind {
  if (value !== "revenue" && value !== "cost") {
    throw new Error("매출 또는 매입을 선택해 주세요.");
  }
  return value;
}

function parseAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new Error("금액은 원 단위 정수로 0 이상 입력해 주세요.");
  }
  return amount;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function normalizeInput(input: ProjectAmountInput) {
  return {
    kind: parseKind(input.kind),
    amount: parseAmount(input.amount),
    label: normalizeText(input.label),
    memo: normalizeText(input.memo),
  };
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/finance");
  revalidatePath("/projects/stats");
}

export async function createProjectAmount(projectId: string, input: ProjectAmountInput) {
  await requireEditAccess("projects");
  const data = normalizeInput(input);

  const amount = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const created = await tx.projectAmount.create({ data: { projectId, ...data } });
    await recalculateProjectTotals(projectId, tx);
    return created;
  });

  revalidateProject(projectId);
  return amount;
}

export async function updateProjectAmount(
  amountId: string,
  projectId: string,
  input: ProjectAmountInput,
) {
  await requireEditAccess("projects");
  const data = normalizeInput(input);

  const amount = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectAmount.findUnique({ where: { id: amountId } });
    if (!existing || existing.projectId !== projectId) {
      throw new Error("매출·매입 건을 찾을 수 없습니다.");
    }

    const updated = await tx.projectAmount.update({ where: { id: amountId }, data });
    await recalculateProjectTotals(projectId, tx);
    return updated;
  });

  revalidateProject(projectId);
  return amount;
}

export async function deleteProjectAmount(amountId: string, projectId: string) {
  await requireEditAccess("projects");

  await prisma.$transaction(async (tx) => {
    const existing = await tx.projectAmount.findUnique({ where: { id: amountId } });
    if (!existing || existing.projectId !== projectId) {
      throw new Error("매출·매입 건을 찾을 수 없습니다.");
    }

    await tx.projectAmount.delete({ where: { id: amountId } });
    await recalculateProjectTotals(projectId, tx);
  });

  revalidateProject(projectId);
}
