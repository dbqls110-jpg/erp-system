"use server";

import { prisma } from "@/lib/prisma";
import { requireEditAccess } from "@/lib/actionGuards";
import { syncPartnersToSheet } from "@/lib/partnerSheet";
import { revalidatePath } from "next/cache";



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
  await requireEditAccess("customers");
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
  await requireEditAccess("customers");
  await prisma.customer.update({
    where: { id },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    ),
  });
  revalidatePath("/customers");
}

export async function deleteCustomer(id: string) {
  await requireEditAccess("customers");
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
}

/**
 * 파트너가 바뀔 때마다 구글 시트를 DB 와 같게 맞춘다.
 *
 * DB 쓰기가 끝난 뒤에 부른다. 시트가 실패해도 등록을 되돌리지 않는다 —
 * 정본은 DB 이고, 시트 하나 때문에 파트너를 못 만드는 편이 더 나쁘다.
 * 대신 실패 이유는 서버 로그에 남겨 나중에 원인을 볼 수 있게 한다.
 */
async function syncPartnerSheet() {
  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: "asc" },
    include: { projects: { include: { project: { select: { name: true } } } } },
  });
  const result = await syncPartnersToSheet(
    partners.map((p) => ({
      name: p.name,
      job: p.job,
      contractStatus: p.contractStatus,
      settlementType: p.settlementType,
      phone: p.phone,
      projectNames: p.projects.map((x) => x.project.name),
      memo: p.memo,
      createdAt: p.createdAt,
    })),
  );
  if (!result.ok) console.warn("[파트너 시트 동기화 실패]", result.reason);
}

/* ---------------------------------- 파트너 --------------------------------- */

export async function createPartner(data: {
  name: string;
  job?: string;
  phone?: string;
  contractStatus?: string;
  contractStart?: string;
  contractEnd?: string;
  settlementType?: string;
  memo?: string;
}) {
  await requireEditAccess("partners");
  if (!data.name.trim()) throw new Error("이름을 입력해주세요.");

  await prisma.partner.create({
    data: {
      name: data.name.trim(),
      job: data.job?.trim() || null,
      phone: data.phone?.trim() || null,
      contractStatus: data.contractStatus?.trim() || "대기",
      contractStart: data.contractStart?.trim() || null,
      contractEnd: data.contractEnd?.trim() || null,
      settlementType: data.settlementType?.trim() || null,
      memo: data.memo?.trim() || null,
    },
  });
  await syncPartnerSheet();
  revalidatePath("/partners");
}

export async function updatePartner(
  id: string,
  data: Partial<{
    name: string;
    job: string;
    phone: string;
    contractStatus: string;
    contractStart: string;
    contractEnd: string;
    settlementType: string;
    memo: string;
  }>,
) {
  await requireEditAccess("partners");
  await prisma.partner.update({
    where: { id },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    ),
  });
  await syncPartnerSheet();
  revalidatePath("/partners");
}

export async function deletePartner(id: string) {
  await requireEditAccess("partners");
  await prisma.partner.delete({ where: { id } });
  await syncPartnerSheet();
  revalidatePath("/partners");
}

/* ------------------------- 프로젝트 ↔ 거래처/파트너 연결 ------------------------ */

export async function linkProjectCustomer(projectId: string, customerId: string) {
  await requireEditAccess("projects");
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
  await requireEditAccess("projects");
  await prisma.projectCustomer.delete({
    where: { projectId_customerId: { projectId, customerId } },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/customers");
}

export async function linkProjectPartner(projectId: string, partnerId: string) {
  await requireEditAccess("projects");
  await prisma.projectPartner.upsert({
    where: { projectId_partnerId: { projectId, partnerId } },
    create: { projectId, partnerId },
    update: {},
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/partners");
}

export async function unlinkProjectPartner(projectId: string, partnerId: string) {
  await requireEditAccess("projects");
  await prisma.projectPartner.delete({
    where: { projectId_partnerId: { projectId, partnerId } },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/partners");
}
