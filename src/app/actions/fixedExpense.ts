"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireEditAccess } from "@/lib/actionGuards";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  fixedExpenseMonthWhere,
  monthKey,
  planFixedExpenseDelete,
  planFixedExpenseUpdate,
} from "@/lib/fixedExpenseMonths";

interface FixedExpenseInput {
  name: string;
  amount: number;
  dayOfMonth: number;
  category: string;
}

export async function createFixedExpense(data: FixedExpenseInput, year: number, month: number) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("관리자만 고정비를 등록할 수 있습니다.");

  const startMonth = monthKey(year, month);
  const count = await prisma.fixedExpense.count();
  await prisma.fixedExpense.create({
    data: { ...data, order: count, startMonth, endMonth: null },
  });
  revalidatePath("/finance");
}

export async function updateFixedExpense(
  id: string,
  data: FixedExpenseInput,
  year: number,
  month: number,
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("관리자만 고정비를 수정할 수 있습니다.");

  const viewMonth = monthKey(year, month);
  await prisma.$transaction(async (tx) => {
    const fixedExpense = await tx.fixedExpense.findUnique({ where: { id } });
    if (!fixedExpense) throw new Error("고정비 항목을 찾을 수 없습니다.");

    const plan = planFixedExpenseUpdate(fixedExpense, viewMonth);
    if (plan.mode === "in-place") {
      await tx.fixedExpense.update({ where: { id }, data });
      return;
    }

    await tx.fixedExpense.update({
      where: { id },
      data: { endMonth: plan.previousEndMonth },
    });
    await tx.fixedExpense.create({
      data: {
        ...data,
        order: fixedExpense.order,
        startMonth: viewMonth,
        endMonth: null,
      },
    });
  });
  revalidatePath("/finance");
}

export async function deleteFixedExpense(id: string, year: number, month: number) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("관리자만 고정비를 삭제할 수 있습니다.");

  const viewMonth = monthKey(year, month);
  await prisma.$transaction(async (tx) => {
    const fixedExpense = await tx.fixedExpense.findUnique({ where: { id } });
    if (!fixedExpense) throw new Error("고정비 항목을 찾을 수 없습니다.");

    const plan = planFixedExpenseDelete(fixedExpense, viewMonth);
    if (plan.mode === "delete") {
      await tx.fixedExpense.delete({ where: { id } });
      return;
    }

    await tx.fixedExpense.update({
      where: { id },
      data: { endMonth: plan.previousEndMonth },
    });
  });
  revalidatePath("/finance");
}

export async function checkFixedExpense(fixedExpenseId: string, year: number, month: number) {
  const session = await requireEditAccess("finance");

  const viewMonth = monthKey(year, month);
  const fixed = await prisma.fixedExpense.findFirst({
    where: { id: fixedExpenseId, ...fixedExpenseMonthWhere(viewMonth) },
  });
  if (!fixed) throw new Error("해당 달에 적용되는 고정비 항목을 찾을 수 없습니다.");

  const day = Math.min(fixed.dayOfMonth, new Date(year, month, 0).getDate());
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  await prisma.expense.create({
    data: {
      userId: session.user.id,
      date,
      title: fixed.name,
      category: fixed.category,
      amount: fixed.amount,
      fixedExpenseId,
    },
  });
  revalidatePath("/finance");
}

export async function uncheckFixedExpense(fixedExpenseId: string, year: number, month: number) {
  await requireEditAccess("finance");

  const viewMonth = monthKey(year, month);
  const fixed = await prisma.fixedExpense.findFirst({
    where: { id: fixedExpenseId, ...fixedExpenseMonthWhere(viewMonth) },
    select: { id: true },
  });
  if (!fixed) throw new Error("해당 달에 적용되는 고정비 항목을 찾을 수 없습니다.");

  const monthStr = String(month).padStart(2, "0");
  await prisma.expense.deleteMany({
    where: {
      fixedExpenseId,
      date: { startsWith: `${year}-${monthStr}-` },
    },
  });
  revalidatePath("/finance");
}
