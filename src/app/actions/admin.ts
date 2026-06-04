"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function setLeaveBalance(userId: string, year: number, totalDays: number) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  await prisma.leaveBalance.upsert({
    where: { userId_year: { userId, year } },
    update: { totalDays },
    create: { userId, year, totalDays },
  });
  revalidatePath("/admin");
  revalidatePath("/leave");
}

export async function updateUserName(userId: string, name: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  if (!name.trim()) throw new Error("이름을 입력해주세요.");

  await prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
  revalidatePath("/admin");
  revalidatePath("/leave");
  revalidatePath("/dashboard");
}

export async function updateUserRole(userId: string, role: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  if (session.user.id === userId) throw new Error("자신의 권한은 변경할 수 없습니다.");

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin");
}
