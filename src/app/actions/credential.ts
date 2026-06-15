"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.credential.delete({ where: { id } });
  revalidatePath("/credentials");
}
