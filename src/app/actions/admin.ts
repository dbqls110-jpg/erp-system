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

/**
 * 직원 계정은 삭제하지 않고 로그인·메신저 접근만 끈다.
 * 근태·휴가·메시지 이력을 보존해야 하므로 User.active 를 단일 기준으로 쓴다.
 */
export async function setUserActive(userId: string, active: boolean) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  if (session.user.id === userId) throw new Error("현재 로그인한 관리자 계정은 비활성화할 수 없습니다.");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isAgent: true, active: true },
  });
  if (!target || target.isAgent) throw new Error("비활성화할 사용자를 찾을 수 없습니다.");
  if (target.active === active) return;

  if (!active && target.role === "admin") {
    const activeAdmins = await prisma.user.count({
      where: { role: "admin", active: true, isAgent: false },
    });
    if (activeAdmins <= 1) throw new Error("활성 관리자 계정이 최소 1개는 필요합니다.");
  }

  if (!active) {
    const assignedExternalCount = await prisma.user.count({ where: { staffUserId: userId, active: true } });
    if (assignedExternalCount > 0) {
      throw new Error(`담당 직원으로 지정된 외부 계정 ${assignedExternalCount}개를 먼저 재배정해주세요.`);
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/messenger");
}

export async function linkUserToExternal(
  userId: string,
  link: { partnerId?: string | null; customerId?: string | null; venueId?: string | null },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");

  const partnerId = link.partnerId || null;
  const customerId = link.customerId || null;
  const venueId = link.venueId || null;

  if ([partnerId, customerId, venueId].filter(Boolean).length > 1) {
    throw new Error("파트너·거래처·공간 중 하나만 지정할 수 있습니다.");
  }
  if (session.user.id === userId && (partnerId || customerId || venueId)) {
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
  if (venueId) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    if (!venue) throw new Error("대상을 찾을 수 없습니다.");
  }

  await prisma.user.update({ where: { id: userId }, data: { partnerId, customerId, venueId } });
  revalidatePath("/admin");
}

/** 외부인의 담당 직원 지정. 메신저에서 외부인은 이 사람에게만 말을 걸 수 있다. */
export async function assignStaffToUser(userId: string, staffUserId: string | null) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  const staffId = staffUserId || null;
  if (staffId) {
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: { id: true, role: true, active: true, isAgent: true, partnerId: true, customerId: true, venueId: true },
    });
    if (!staff || !staff.active || staff.isAgent || staff.partnerId || staff.customerId || staff.venueId
      || !["admin", "manager", "member", "user"].includes(staff.role)) {
      throw new Error("담당 직원은 내부 직원이어야 합니다.");
    }
    if (staffId === userId) throw new Error("본인을 담당 직원으로 둘 수 없습니다.");
  }
  await prisma.user.update({ where: { id: userId }, data: { staffUserId: staffId } });
  revalidatePath("/admin");
}

/** 공간 호스트 연결용 검색. 공간 DB 가 4천 곳이라 목록으로 내려주지 않고 이름으로 찾는다. */
export async function searchVenuesForLink(query: string): Promise<{ id: string; name: string }[]> {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.venue.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, district: true },
    orderBy: { name: "asc" },
    take: 15,
  });
  return rows.map((v) => ({ id: v.id, name: v.district ? `${v.name} · ${v.district}` : v.name }));
}
