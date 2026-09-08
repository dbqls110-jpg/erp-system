"use server";

import { revalidatePath } from "next/cache";
import { requireEditAccess } from "@/lib/actionGuards";
import { prisma } from "@/lib/prisma";
import {
  appendInquiryProjectRow,
  getInquiryByIdentity,
  saveInquiryMemo,
  saveInquiryProject,
  saveInquiryStage,
} from "@/lib/inquirySheet";
import { parseSheetDateTime, type InquiryIdentity, type InquiryRecord, type InquiryStage } from "@/lib/inquiries";
import {
  saveSpaceRegistrationMemo,
  saveSpaceRegistrationStage,
} from "@/lib/spaceRegistrationSheet";
import type { SpaceRegistrationIdentity, SpaceRegistrationStage } from "@/lib/spaceRegistrations";

export interface CreateInquiryProjectResult {
  projectId: string;
  projectName: string;
  projectUrl: string;
  reused: boolean;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "") || normalizeText(value);
}

function normalizeEmail(value: string): string {
  return normalizeText(value).toLowerCase();
}

function inquiryProjectMarker(identity: InquiryIdentity): string {
  const submittedAt = parseSheetDateTime(identity.submittedAt)?.toISOString() ?? normalizeText(identity.submittedAt).toLowerCase();
  return [
    submittedAt,
    normalizeText(identity.name).toLowerCase(),
    normalizeEmail(identity.email),
    normalizePhone(identity.phone),
  ].join(" | ");
}

function buildInquiryProjectMemo(inquiry: InquiryRecord): string {
  // 접수 식별자를 메모에 남겨야 시트 저장이 실패한 뒤 재시도해도 같은 프로젝트를 찾을 수 있다.
  return [
    `문의 식별: ${inquiryProjectMarker(inquiry.identity)}`,
    `대관 유형: ${inquiry.rentalType || "-"}`,
    `희망 지역: ${inquiry.desiredArea || "-"}`,
    `문의 내용: ${inquiry.content || "-"}`,
  ].join("\n");
}

function projectUrl(projectId: string): string {
  const baseUrl = (process.env.NEXTAUTH_URL ?? "https://erp-system-lojo.onrender.com").replace(/\/+$/, "");
  return `${baseUrl}/projects/${encodeURIComponent(projectId)}`;
}

async function findOrCreateCustomer(inquiry: InquiryRecord) {
  const name = normalizeText(inquiry.name);
  const phone = normalizeText(inquiry.phone);
  const email = normalizeEmail(inquiry.email);
  if (!name) throw new Error("문의 이름이 없어 거래처를 만들 수 없습니다.");
  const candidates = await prisma.customer.findMany({
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const existing =
    candidates.find((customer) => normalizeText(customer.name).toLowerCase() === name.toLowerCase()) ??
    candidates.find((customer) => (
      (email && normalizeEmail(customer.email ?? "") === email) ||
      (phone && normalizePhone(customer.phone ?? "") === normalizePhone(phone))
    ));
  if (existing) return { customer: existing, created: false };

  const created = await prisma.customer.create({
    data: {
      name,
      phone: phone || null,
      email: email || null,
      category: "고객사",
      industry: null,
      status: "거래중",
    },
    select: { id: true, name: true, phone: true, email: true },
  });
  return { customer: created, created: true };
}

async function findInquiryProject(inquiry: InquiryRecord, name?: string) {
  const marker = `문의 식별: ${inquiryProjectMarker(inquiry.identity)}`;
  const byMarker = await prisma.project.findFirst({
    where: { memo: { contains: marker } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (byMarker) return byMarker;
  if (!name) return null;
  return prisma.project.findFirst({
    where: { name },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}

function creationFailureMessage(
  error: unknown,
  state: {
    customer: string;
    project: string;
    projectSheet: string;
    inquirySheet: string;
  },
): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `프로젝트 생성이 끝까지 저장되지 않았습니다: ${reason}\n` +
    `현재 상태 — 거래처: ${state.customer}; ERP 프로젝트: ${state.project}; ` +
    `프로젝트 시트: ${state.projectSheet}; 문의 시트 O열: ${state.inquirySheet}. ` +
    "이미 생성된 거래처·프로젝트는 재시도 때 식별자로 재사용합니다.",
  );
}

export async function updateInquiryStage(identity: InquiryIdentity, nextStage: InquiryStage) {
  await requireEditAccess("inquiries");
  const result = await saveInquiryStage(identity, nextStage);
  revalidatePath("/inquiries");
  return result;
}

export async function updateInquiryMemo(identity: InquiryIdentity, memo: string) {
  await requireEditAccess("inquiries");
  const result = await saveInquiryMemo(identity, memo);
  revalidatePath("/inquiries");
  return result;
}

export async function updateSpaceRegistrationStage(
  identity: SpaceRegistrationIdentity,
  nextStage: SpaceRegistrationStage,
) {
  await requireEditAccess("inquiries");
  const result = await saveSpaceRegistrationStage(identity, nextStage);
  revalidatePath("/inquiries");
  return result;
}

export async function updateSpaceRegistrationMemo(identity: SpaceRegistrationIdentity, memo: string) {
  await requireEditAccess("inquiries");
  const result = await saveSpaceRegistrationMemo(identity, memo);
  revalidatePath("/inquiries");
  return result;
}

export async function createProjectFromInquiry(
  identity: InquiryIdentity,
  requestedProjectName: string,
): Promise<CreateInquiryProjectResult> {
  // 문의 화면에서 시작해도 거래처·프로젝트라는 공유 자료를 만들기 때문에 세 메뉴의 쓰기 권한을 모두 확인한다.
  await requireEditAccess("inquiries");
  await requireEditAccess("customers");
  await requireEditAccess("projects");

  const inquiry = await getInquiryByIdentity(identity);
  if (inquiry.projectName) {
    const existing = await findInquiryProject(inquiry, inquiry.projectName);
    if (!existing) {
      throw new Error(`문의 시트 O열에 ‘${inquiry.projectName}’이 있지만 ERP 프로젝트를 찾지 못했습니다.`);
    }
    return {
      projectId: existing.id,
      projectName: existing.name,
      projectUrl: projectUrl(existing.id),
      reused: true,
    };
  }
  if (inquiry.status !== "성사") {
    throw new Error("성사 단계의 문의만 프로젝트로 만들 수 있습니다.");
  }

  const projectName = normalizeText(requestedProjectName);
  if (!projectName) throw new Error("프로젝트명을 입력해 주세요.");

  const state = {
    customer: "아직 처리하지 않음",
    project: "아직 처리하지 않음",
    projectSheet: "아직 처리하지 않음",
    inquirySheet: "아직 처리하지 않음",
  };
  let project: { id: string; name: string } | null = null;
  let projectWasCreated = false;

  // DB와 Google Sheets는 하나의 트랜잭션이 아니므로 중간 성공을 지우지 않는다.
  // 대신 상태를 오류에 명시하고, 메모 식별자와 시트 행 재확인으로 다음 시도에서 이어간다.
  try {
    const customerResult = await findOrCreateCustomer(inquiry);
    state.customer = `${customerResult.created ? "새로 생성" : "기존 사용"} ‘${customerResult.customer.name}’`;

    project = await findInquiryProject(inquiry);
    if (!project) {
      project = await prisma.project.create({
        data: {
          name: projectName,
          client: inquiry.name || null,
          assignee: inquiry.assignee || null,
          memo: buildInquiryProjectMemo(inquiry),
          status: "active",
        },
        select: { id: true, name: true },
      });
      projectWasCreated = true;
    }
    state.project = `${projectWasCreated ? "새로 생성" : "기존 사용"} ‘${project.name}’`;

    await prisma.projectCustomer.upsert({
      where: { projectId_customerId: { projectId: project.id, customerId: customerResult.customer.id } },
      create: { projectId: project.id, customerId: customerResult.customer.id },
      update: {},
    });

    const projectSheetResult = await appendInquiryProjectRow(inquiry, project.name, customerResult.customer.name);
    state.projectSheet = projectSheetResult.alreadyExists ? "기존 행 확인" : "행 추가 완료";

    const inquirySheetResult = await saveInquiryProject(identity, project.name, projectUrl(project.id));
    state.inquirySheet = inquirySheetResult.alreadyLinked ? "기존 연결 확인" : "O열 기록 완료";

    revalidatePath("/inquiries");
    revalidatePath("/customers");
    revalidatePath("/projects");
    revalidatePath(`/projects/${project.id}`);
    return {
      projectId: project.id,
      projectName: inquirySheetResult.projectName,
      projectUrl: projectUrl(project.id),
      reused: !projectWasCreated,
    };
  } catch (error) {
    throw creationFailureMessage(error, state);
  }
}
