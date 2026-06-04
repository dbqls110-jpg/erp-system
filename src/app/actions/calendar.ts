"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createCalendarEvent(data: {
  title: string;
  date: string;
  endDate?: string;
  color: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.calendarEvent.create({
    data: {
      title: data.title,
      date: data.date,
      endDate: data.endDate || null,
      color: data.color,
      createdBy: session.user.id,
    },
  });

  revalidatePath("/calendar");
}

export async function deleteCalendarEvent(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event) throw new Error("일정을 찾을 수 없습니다.");

  if (event.createdBy !== session.user.id && session.user.role !== "admin") {
    throw new Error("삭제 권한이 없습니다.");
  }

  await prisma.calendarEvent.delete({ where: { id } });
  revalidatePath("/calendar");
}
