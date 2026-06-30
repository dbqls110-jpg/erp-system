"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createNotionEvent, archiveNotionEvent } from "@/lib/notion";

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "연차", half_am: "반차(오전)", half_pm: "반차(오후)", hourly: "시간차",
};

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
  if (type === "half_am" || type === "half_pm") {
    days = 0.5;
  } else if (type === "hourly") {
    if (!startTime || !endTime) throw new Error("시간차 신청 시 시작/종료 시간을 입력해주세요.");
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const hours = (eh * 60 + em - sh * 60 - sm) / 60;
    if (hours <= 0) throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
    days = Math.round((hours / 8) * 100) / 100;
  } else if (type === "annual" && startDate && endDate) {
    // UTC 파싱으로 시간대 오류 방지
    const [sy, smo, sd] = startDate.split("-").map(Number);
    const [ey, emo, ed] = endDate.split("-").map(Number);
    days = Math.round((Date.UTC(ey, emo - 1, ed) - Date.UTC(sy, smo - 1, sd)) / 86400000) + 1;
    if (days <= 0) throw new Error("종료일은 시작일과 같거나 늦어야 합니다.");
  }

  if (days <= 0) throw new Error("유효하지 않은 휴가 일수입니다.");

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

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
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

  // Notion 캘린더에 휴가 등록
  const title = `🌴 ${req.user.name ?? "직원"} ${LEAVE_TYPE_LABEL[req.type] ?? "휴가"}`;
  const endDate = req.endDate !== req.startDate ? req.endDate : undefined;
  const notionPageId = await createNotionEvent(title, req.startDate, endDate);
  if (notionPageId) {
    await prisma.leaveRequest.update({ where: { id }, data: { notionPageId } });
  }

  revalidatePath("/leave");
}

export async function cancelLeave(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req) return;
  if (req.userId !== session.user.id) throw new Error("Unauthorized");
  if (req.status !== "pending") throw new Error("대기 중인 휴가만 취소할 수 있습니다.");

  const year = new Date(req.startDate).getFullYear();

  await prisma.$transaction([
    prisma.leaveRequest.update({ where: { id }, data: { status: "rejected", adminNote: "본인 취소" } }),
    prisma.leaveBalance.update({
      where: { userId_year: { userId: req.userId, year } },
      data: { pendingDays: { decrement: req.days } },
    }),
  ]);

  revalidatePath("/leave");
}

export async function deleteLeave(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("관리자만 삭제할 수 있습니다.");

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req) return;

  const year = new Date(req.startDate).getFullYear();

  const balanceUpdates: Parameters<typeof prisma.leaveBalance.update>[0]["data"] = {};
  if (req.status === "pending") balanceUpdates.pendingDays = { decrement: req.days };
  if (req.status === "approved") balanceUpdates.usedDays = { decrement: req.days };

  await prisma.$transaction([
    prisma.leaveRequest.delete({ where: { id } }),
    ...(Object.keys(balanceUpdates).length > 0
      ? [prisma.leaveBalance.update({
          where: { userId_year: { userId: req.userId, year } },
          data: balanceUpdates,
        })]
      : []),
  ]);

  // Notion 이벤트 아카이브 (승인된 휴가였던 경우)
  if (req.notionPageId) {
    void archiveNotionEvent(req.notionPageId);
  }

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
