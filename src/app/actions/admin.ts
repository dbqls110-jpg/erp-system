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

export async function linkUserToExternal(
  userId: string,
  link: { partnerId?: string | null; customerId?: string | null },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  const partnerId = link.partnerId || null;
  const customerId = link.customerId || null;

  if (partnerId && customerId) {
    throw new Error("파트너와 거래처 중 하나만 지정할 수 있습니다.");
  }
  if (session.user.id === userId && (partnerId || customerId)) {
    throw new Error("본인 계정은 외부로 연결할 수 없습니다.");
  }

  if (partnerId) {
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) throw new Error("대상을 찾을 수 없습니다.");
  }
  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new Error("대상을 찾을 수 없습니다.");
  }

  await prisma.user.update({ where: { id: userId }, data: { partnerId, customerId } });
  revalidatePath("/admin");
}
