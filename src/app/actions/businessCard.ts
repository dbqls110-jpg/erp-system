"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createBusinessCard(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.businessCard.create({
    data: {
      userId: session.user.id,
      name: formData.get("name") as string,
      company: (formData.get("company") as string) || null,
      jobTitle: (formData.get("jobTitle") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      address: (formData.get("address") as string) || null,
    },
  });
  revalidatePath("/business-cards");
}

export async function deleteBusinessCard(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  await prisma.businessCard.delete({ where: { id } });
  revalidatePath("/business-cards");
}
