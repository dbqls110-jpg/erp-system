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

  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  });
  if (existing?.clockIn) return; // 이미 출근 기록 있으면 무시

  await prisma.attendance.upsert({
    where: { userId_date: { userId: session.user.id, date: today } },
    update: { clockIn: new Date(), clockOut: null, workHours: null },
    create: { userId: session.user.id, date: today, clockIn: new Date() },
  });
  revalidatePath("/attendance");
}

export async function adminDeleteAttendance(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  await prisma.attendance.delete({ where: { id } });
  revalidatePath("/attendance");
}

export async function adminUpdateAttendance(
  attendanceId: string,
  clockIn: string | null,
  clockOut: string | null
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
  if (!attendance) throw new Error("Not found");

  const ci = clockIn ? new Date(`${attendance.date}T${clockIn}:00`) : null;
  const co = clockOut ? new Date(`${attendance.date}T${clockOut}:00`) : null;
  const workHours =
    ci && co ? Math.round(((co.getTime() - ci.getTime()) / 3600000) * 100) / 100 : null;

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { clockIn: ci, clockOut: co, workHours },
  });

  const year = new Date(attendance.date).getFullYear();
  const month = new Date(attendance.date).getMonth() + 1;
  revalidatePath(`/attendance?year=${year}&month=${month}`);
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
