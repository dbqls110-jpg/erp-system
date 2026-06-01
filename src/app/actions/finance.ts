"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function setBudget(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  const year = parseInt(formData.get("year") as string);
  const month = parseInt(formData.get("month") as string);
  const amount = parseFloat(formData.get("amount") as string);

  await prisma.budget.upsert({
    where: { year_month: { year, month } },
    update: { amount },
    create: { year, month, amount },
  });
  revalidatePath("/finance");
}

export async function addExpense(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.expense.create({
    data: {
      userId: session.user.id,
      date: formData.get("date") as string,
      title: formData.get("title") as string,
      category: formData.get("category") as string,
      amount: parseFloat(formData.get("amount") as string),
      memo: (formData.get("memo") as string) || null,
    },
  });
  revalidatePath("/finance");
}

export async function deleteExpense(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/finance");
}
