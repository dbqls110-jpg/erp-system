"use server";

import { revalidatePath } from "next/cache";

import { requireEditAccess } from "@/lib/actionGuards";
import { prisma } from "@/lib/prisma";

const PAID_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PartnerPaymentData = {
  item: string;
  amount: number;
  unit?: string;
  quantity?: number;
  paidOn?: string | null;
  memo?: string | null;
  projectId?: string | null;
};

function validateItem(item: string) {
  if (!item.trim()) throw new Error("작업 이름을 입력해주세요.");
}

function validateAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("금액을 입력해주세요.");
}

function validateQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("수량을 입력해주세요.");
}

function normalizePaidOn(paidOn: string | null | undefined) {
  const normalized = paidOn?.trim() || null;
  if (normalized !== null && !PAID_ON_PATTERN.test(normalized)) {
    throw new Error("지급일은 YYYY-MM-DD 형식으로 입력해주세요.");
  }
  return normalized;
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() || null;
}

export async function addPartnerPayment(partnerId: string, data: PartnerPaymentData) {
  await requireEditAccess("partners");
  validateItem(data.item);
  validateAmount(data.amount);
  const quantity = data.quantity ?? 1;
  validateQuantity(quantity);
  const paidOn = normalizePaidOn(data.paidOn);

  await prisma.partnerPayment.create({
    data: {
      partnerId,
      projectId: normalizeText(data.projectId),
      item: data.item.trim(),
      amount: data.amount,
      unit: data.unit?.trim() || "건당",
      quantity,
      paidOn,
      memo: normalizeText(data.memo),
    },
  });
  revalidatePath("/partners");
}

export async function updatePartnerPayment(
  id: string,
  data: Partial<PartnerPaymentData>,
) {
  await requireEditAccess("partners");
  if (data.item !== undefined) validateItem(data.item);
  if (data.amount !== undefined) validateAmount(data.amount);
  if (data.quantity !== undefined) validateQuantity(data.quantity);
  const paidOn = data.paidOn === undefined ? undefined : normalizePaidOn(data.paidOn);

  await prisma.partnerPayment.update({
    where: { id },
    data: {
      ...(data.item !== undefined ? { item: data.item.trim() } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.unit !== undefined ? { unit: data.unit.trim() || "건당" } : {}),
      ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
      ...(data.paidOn !== undefined ? { paidOn } : {}),
      ...(data.memo !== undefined ? { memo: normalizeText(data.memo) } : {}),
      ...(data.projectId !== undefined ? { projectId: normalizeText(data.projectId) } : {}),
    },
  });
  revalidatePath("/partners");
}

export async function deletePartnerPayment(id: string) {
  await requireEditAccess("partners");
  await prisma.partnerPayment.delete({ where: { id } });
  revalidatePath("/partners");
}
