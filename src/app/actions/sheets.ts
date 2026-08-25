"use server";

import { prisma } from "@/lib/prisma";
import { requireEditAccess } from "@/lib/actionGuards";
import { revalidatePath } from "next/cache";

export async function createSheetLink(data: {
  name: string;
  url: string;
  description?: string;
  category?: string;
}) {
  await requireEditAccess("sheets");

  await prisma.sheetLink.create({ data });
  revalidatePath("/sheets");
}

export async function updateSheetLink(id: string, data: {
  name: string;
  url: string;
  description?: string;
  category?: string;
}) {
  await requireEditAccess("sheets");

  await prisma.sheetLink.update({ where: { id }, data });
  revalidatePath("/sheets");
}

export async function deleteSheetLink(id: string) {
  await requireEditAccess("sheets");

  await prisma.sheetLink.delete({ where: { id } });
  revalidatePath("/sheets");
}
