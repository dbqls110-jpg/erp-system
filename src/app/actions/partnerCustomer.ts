"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

/* ---------------------------------- 거래처 --------------------------------- */

export async function createCustomer(data: {
  name: string;
  manager?: string;
  phone?: string;
  email?: string;
  category?: string;
  status?: string;
  memo?: string;
}) {
  await requireSession();
  if (!data.name.trim()) throw new Error("회사명을 입력해주세요.");

  await prisma.customer.create({
    data: {
      name: data.name.trim(),
      manager: data.manager?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      category: data.category?.trim() || null,
      status: data.status?.trim() || "거래중",
      memo: data.memo?.trim() || null,
    },
  });
  revalidatePath("/customers");
}

export async function updateCustomer(
  id: string,
  data: Partial<{
    name: string;
    manager: string;
    phone: string;
    email: string;
    category: string;
    status: string;
    memo: string;
  }>,
) {
  await requireSession();
  await prisma.customer.update({
    where: { id },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    ),
  });
  revalidatePath("/customers");
}

export async function deleteCustomer(id: string) {
  await requireSession();
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
}

/* ---------------------------------- 파트너 --------------------------------- */

export async function createPartner(data: {
  name: string;
  manager?: string;
  phone?: string;
  contractStatus?: string;
  contractStart?: string;
  contractEnd?: string;
  settlementType?: string;
  memo?: string;
}) {
  await requireSession();
  if (!data.name.trim()) throw new Error("파트너사명을 입력해주세요.");

  await prisma.partner.create({
    data: {
      name: data.name.trim(),
      manager: data.manager?.trim() || null,
      phone: data.phone?.trim() || null,
      contractStatus: data.contractStatus?.trim() || "대기",
      contractStart: data.contractStart?.trim() || null,
      contractEnd: data.contractEnd?.trim() || null,
      settlementType: data.settlementType?.trim() || null,
      memo: data.memo?.trim() || null,
    },
  });
  revalidatePath("/partners");
}

export async function updatePartner(
  id: string,
  data: Partial<{
    name: string;
    manager: string;
    phone: string;
    contractStatus: string;
    contractStart: string;
    contractEnd: string;
    settlementType: string;
    memo: string;
  }>,
) {
  await requireSession();
  await prisma.partner.update({
    where: { id },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    ),
  });
  revalidatePath("/partners");
}

export async function deletePartner(id: string) {
  await requireSession();
  await prisma.partner.delete({ where: { id } });
  revalidatePath("/partners");
}

/* ------------------------- 프로젝트 ↔ 거래처/파트너 연결 ------------------------ */

export async function linkProjectCustomer(projectId: string, customerId: string) {
  await requireSession();
  // 이미 연결돼 있으면 조용히 넘어간다(중복 클릭 대비).
  await prisma.projectCustomer.upsert({
    where: { projectId_customerId: { projectId, customerId } },
    create: { projectId, customerId },
    update: {},
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/customers");
}

export async function unlinkProjectCustomer(projectId: string, customerId: string) {
  await requireSession();
  await prisma.projectCustomer.delete({
    where: { projectId_customerId: { projectId, customerId } },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/customers");
}

export async function linkProjectPartner(projectId: string, partnerId: string) {
  await requireSession();
  await prisma.projectPartner.upsert({
    where: { projectId_partnerId: { projectId, partnerId } },
    create: { projectId, partnerId },
    update: {},
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/partners");
}

export async function unlinkProjectPartner(projectId: string, partnerId: string) {
  await requireSession();
  await prisma.projectPartner.delete({
    where: { projectId_partnerId: { projectId, partnerId } },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/partners");
}
