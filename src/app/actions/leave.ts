"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function applyLeave(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const type = formData.get("type") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const startTime = formData.get("startTime") as string | null;
  const endTime = formData.get("endTime") as string | null;
  const reason = formData.get("reason") as string;

  let days = 1;
  if (type === "half_am" || type === "half_pm") days = 0.5;
  else if (type === "hourly" && startTime && endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const hours = (eh * 60 + em - sh * 60 - sm) / 60;
    days = Math.round((hours / 7) * 100) / 100;
  } else if (type === "annual" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  }

  const year = new Date(startDate).getFullYear();

  // 잔여 휴가 확인
  let balance = await prisma.leaveBalance.findUnique({
    where: { userId_year: { userId: session.user.id, year } },
  });
  if (!balance) {
    balance = await prisma.leaveBalance.create({
      data: { userId: session.user.id, year, totalDays: 15 },
    });
  }

  const available = balance.totalDays - balance.usedDays - balance.pendingDays;
  if (days > available) throw new Error("잔여 휴가가 부족합니다.");

  await prisma.$transaction([
    prisma.leaveRequest.create({
      data: {
        userId: session.user.id,
        type,
        startDate,
        endDate,
        startTime: startTime || null,
        endTime: endTime || null,
        days,
        reason,
        status: "pending",
      },
    }),
    prisma.leaveBalance.update({
      where: { userId_year: { userId: session.user.id, year } },
      data: { pendingDays: { increment: days } },
    }),
  ]);

  revalidatePath("/leave");
}

export async function approveLeave(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.status !== "pending") return;

  const year = new Date(req.startDate).getFullYear();

  await prisma.$transaction([
    prisma.leaveRequest.update({ where: { id }, data: { status: "approved" } }),
    prisma.leaveBalance.update({
      where: { userId_year: { userId: req.userId, year } },
      data: {
        usedDays: { increment: req.days },
        pendingDays: { decrement: req.days },
      },
    }),
  ]);

  revalidatePath("/leave");
}

export async function rejectLeave(id: string, note: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.status !== "pending") return;

  const year = new Date(req.startDate).getFullYear();

  await prisma.$transaction([
    prisma.leaveRequest.update({ where: { id }, data: { status: "rejected", adminNote: note } }),
    prisma.leaveBalance.update({
      where: { userId_year: { userId: req.userId, year } },
      data: { pendingDays: { decrement: req.days } },
    }),
  ]);

  revalidatePath("/leave");
}
