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

  const allowedCategories = new Set(["고객사", "협력사", "공급사"]);
  const allowedStatuses = new Set(["거래중", "보류", "종료"]);
  const category = data.category?.trim() || "고객사";
  const status = data.status?.trim() || "거래중";
  if (!allowedCategories.has(category)) throw new Error("올바른 거래처 분류를 선택해주세요.");
  if (!allowedStatuses.has(status)) throw new Error("올바른 거래처 상태를 선택해주세요.");

  await prisma.customer.create({
    data: {
      name: data.name.trim(),
      manager: data.manager?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      category,
      status,
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
    // 문자열만 다듬는다. rate 는 숫자라 trim 대상이 아니고, null 이면 지우는 뜻이다.
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
    include: {
      projects: { include: { project: { select: { name: true } } } },
      rates: { orderBy: { order: "asc" } },
    },
  });
  const result = await syncPartnersToSheet(
    partners.map((p) => ({
      name: p.name,
      job: p.job,
      contractStatus: p.contractStatus,
      rate: p.rate,
      rateUnit: p.rateUnit,
      settlementType: p.settlementType,
      phone: p.phone,
      projectNames: p.projects.map((x) => x.project.name),
      memo: p.memo,
      rates: p.rates.map((rate) => ({ item: rate.item, amount: rate.amount, unit: rate.unit })),
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
  rate?: number | null;
  rateUnit?: string;
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
      rate: data.rate ?? null,
      rateUnit: data.rateUnit?.trim() || null,
      contractStatus: data.contractStatus?.trim() || "활성",
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
    rate: number | null;
    rateUnit: string;
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
    // 문자열만 다듬는다. rate 는 숫자라 trim 대상이 아니고, null 이면 지우는 뜻이다.
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

function isUniqueConstraintError(error: unknown) {
  // Prisma의 고유 제약 오류만 사용자가 알아볼 수 있는 작업명 중복 안내로 바꾼다.
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export async function addPartnerRate(
  partnerId: string,
  data: { item: string; amount: number; unit?: string; memo?: string },
) {
  await requireEditAccess("partners");
  if (!data.item.trim()) throw new Error("작업 이름을 입력해주세요.");
  if (data.amount <= 0) throw new Error("단가를 입력해주세요.");

  try {
    await prisma.partnerRate.create({
      data: {
        partnerId,
        item: data.item.trim(),
        amount: data.amount,
        unit: data.unit?.trim() || "건당",
        memo: data.memo?.trim() || null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("이미 등록된 작업 이름입니다.");
    throw error;
  }
  await syncPartnerSheet();
  revalidatePath("/partners");
}

export async function updatePartnerRate(
  id: string,
  data: Partial<{ item: string; amount: number; unit: string; memo: string }>,
) {
  await requireEditAccess("partners");
  if (data.item !== undefined && !data.item.trim()) throw new Error("작업 이름을 입력해주세요.");
  if (data.amount !== undefined && data.amount <= 0) throw new Error("단가를 입력해주세요.");

  try {
    await prisma.partnerRate.update({
      where: { id },
      data: {
        ...(data.item !== undefined ? { item: data.item.trim() } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.unit !== undefined ? { unit: data.unit.trim() || "건당" } : {}),
        ...(data.memo !== undefined ? { memo: data.memo.trim() || null } : {}),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("이미 등록된 작업 이름입니다.");
    throw error;
  }
  await syncPartnerSheet();
  revalidatePath("/partners");
}

export async function deletePartnerRate(id: string) {
  await requireEditAccess("partners");
  await prisma.partnerRate.delete({ where: { id } });
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
