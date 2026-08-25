"use server";

import { prisma } from "@/lib/prisma";
import { requireEditAccess } from "@/lib/actionGuards";
import { revalidatePath } from "next/cache";

export async function createCredential(data: {
  name: string;
  company?: string;
  category?: string;
  username?: string;
  password?: string;
  memo?: string;
  url?: string;
}) {
  await requireEditAccess("credentials");

  await prisma.credential.create({
    data: {
      name: data.name.trim(),
      company: data.company?.trim() || null,
      category: data.category?.trim() || null,
      username: data.username?.trim() || null,
      password: data.password || null,
      memo: data.memo?.trim() || null,
      url: data.url?.trim() || null,
    },
  });

  revalidatePath("/credentials");
}

export async function updateCredential(
  id: string,
  data: {
    name: string;
    company?: string;
    category?: string;
    username?: string;
    password?: string;
    memo?: string;
    url?: string;
  }
) {
  await requireEditAccess("credentials");

  await prisma.credential.update({
    where: { id },
    data: {
      name: data.name.trim(),
      company: data.company?.trim() || null,
      category: data.category?.trim() || null,
      username: data.username?.trim() || null,
      password: data.password || null,
      memo: data.memo?.trim() || null,
      url: data.url?.trim() || null,
    },
  });

  revalidatePath("/credentials");
}

export async function deleteCredential(id: string) {
  await requireEditAccess("credentials");

  await prisma.credential.delete({ where: { id } });
  revalidatePath("/credentials");
}
