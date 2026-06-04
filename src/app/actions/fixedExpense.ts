"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createFixedExpense(data: {
  name: string;
  amount: number;
  dayOfMonth: number;
  category: string;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("관리자만 등록할 수 있습니다.");

  const count = await prisma.fixedExpense.count();
  await prisma.fixedExpense.create({
    data: { ...data, order: count },
  });
  revalidatePath("/finance");
}

export async function updateFixedExpense(id: string, data: {
  name: string;
  amount: number;
  dayOfMonth: number;
  category: string;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("관리자만 수정할 수 있습니다.");

  await prisma.fixedExpense.update({ where: { id }, data });
  revalidatePath("/finance");
}

export async function deleteFixedExpense(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("관리자만 삭제할 수 있습니다.");

  await prisma.fixedExpense.delete({ where: { id } });
  revalidatePath("/finance");
}

export async function checkFixedExpense(fixedExpenseId: string, year: number, month: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const fixed = await prisma.fixedExpense.findUnique({ where: { id: fixedExpenseId } });
  if (!fixed) throw new Error("고정비 항목을 찾을 수 없습니다.");

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const monthStr = String(month).padStart(2, "0");
  await prisma.expense.deleteMany({
    where: {
      fixedExpenseId,
      date: { startsWith: `${year}-${monthStr}-` },
    },
  });
  revalidatePath("/finance");
}
