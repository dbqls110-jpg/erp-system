"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { revalidatePath } from "next/cache";

export async function clockOut() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return;

  const today = format(new Date(), "yyyy-MM-dd");
  const attendance = await prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  });

  if (!attendance || attendance.clockOut) return;

  const clockIn = attendance.clockIn ? new Date(attendance.clockIn) : null;
  const clockOutTime = new Date();
  const workHours = clockIn
    ? Math.round(((clockOutTime.getTime() - clockIn.getTime()) / 3600000) * 100) / 100
    : null;

  await prisma.attendance.update({
    where: { userId_date: { userId: session.user.id, date: today } },
    data: { clockOut: clockOutTime, workHours },
  });
}

export async function manualClockIn() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return;

  const today = format(new Date(), "yyyy-MM-dd");

  await prisma.attendance.upsert({
    where: { userId_date: { userId: session.user.id, date: today } },
    update: { clockIn: new Date(), clockOut: null, workHours: null },
    create: {
      userId: session.user.id,
      date: today,
      clockIn: new Date(),
    },
  });
  revalidatePath("/attendance");
}

export async function manualClockOut() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return;

  const today = format(new Date(), "yyyy-MM-dd");
  const attendance = await prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  });

  if (!attendance) return;

  const clockIn = attendance.clockIn ? new Date(attendance.clockIn) : null;
  const clockOutTime = new Date();
  const workHours = clockIn
    ? Math.round(((clockOutTime.getTime() - clockIn.getTime()) / 3600000) * 100) / 100
    : null;

  await prisma.attendance.update({
    where: { userId_date: { userId: session.user.id, date: today } },
    data: { clockOut: clockOutTime, workHours },
  });
  revalidatePath("/attendance");
}
