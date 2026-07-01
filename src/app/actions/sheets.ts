"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createSheetLink(data: {
  name: string;
  url: string;
  description?: string;
  category?: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.sheetLink.create({ data });
  revalidatePath("/sheets");
}

export async function updateSheetLink(id: string, data: {
  name: string;
  url: string;
  description?: string;
  category?: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.sheetLink.update({ where: { id }, data });
  revalidatePath("/sheets");
}

export async function deleteSheetLink(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  await prisma.sheetLink.delete({ where: { id } });
  revalidatePath("/sheets");
}
