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
import {
  inquiryCustomerSeed,
  inquiryProjectMarker,
  inquiryProjectSeed,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  projectCreateData,
  spaceRentalCustomerSeed,
  spaceRentalProjectMarker,
  spaceRentalProjectSeed,
  type CustomerConversionSeed,
  type ProjectConversionSeed,
} from "@/lib/inquiryProjects";
import { type InquiryIdentity, type InquiryStage } from "@/lib/inquiries";
import {
  saveSpaceRegistrationMemo,
  saveSpaceRegistrationStage,
} from "@/lib/spaceRegistrationSheet";
import type { SpaceRegistrationIdentity, SpaceRegistrationStage } from "@/lib/spaceRegistrations";
import type { SpaceRentalIdentity, SpaceRentalStage } from "@/lib/spaceRentals";
import {
  appendSpaceRentalProjectRow,
  getSpaceRentalByIdentity,
  saveSpaceRentalProject,
  saveSpaceRentalStage,
} from "@/lib/spaceRentalSheet";

export interface CreateInquiryProjectResult {
  projectId: string;
  projectName: string;
  projectUrl: string;
  reused: boolean;
}

function projectUrl(projectId: string): string {
  const baseUrl = (process.env.NEXTAUTH_URL ?? "https://erp-system-lojo.onrender.com").replace(/\/+$/, "");
  return `${baseUrl}/projects/${encodeURIComponent(projectId)}`;
}

async function findOrCreateCustomer(seed: CustomerConversionSeed) {
  const name = normalizeText(seed.name);
  const phone = normalizeText(seed.phone);
  const email = normalizeEmail(seed.email);
  if (!name) throw new Error("거래처 이름이 없어 거래처를 만들 수 없습니다.");
  const candidates = await prisma.customer.findMany({
    select: { id: true, name: true, manager: true, phone: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  const existing =
    candidates.find((customer) => normalizeText(customer.name).toLowerCase() === name.toLowerCase()) ??
    candidates.find((customer) => (
      (email && normalizeEmail(customer.email ?? "") === email) ||
      (phone && normalizePhone(customer.phone ?? "") === normalizePhone(phone))
    ));
  if (existing) {
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name,
        phone: phone || null,
        email: email || null,
        ...(seed.manager !== undefined ? { manager: normalizeText(seed.manager ?? "") || null } : {}),
      },
      select: { id: true, name: true, manager: true, phone: true, email: true },
    });
    return { customer: updated, created: false };
  }

  const created = await prisma.customer.create({
    data: {
      name,
      manager: seed.manager === undefined ? null : normalizeText(seed.manager ?? "") || null,
      phone: phone || null,
      email: email || null,
      category: "고객사",
      industry: null,
      status: "거래중",
    },
    select: { id: true, name: true, manager: true, phone: true, email: true },
  });
  return { customer: created, created: true };
}

async function findProjectByMarker(marker: string, name?: string) {
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
    sourceSheet: string;
  },
  sourceSheetLabel: string,
): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `프로젝트 생성이 끝까지 저장되지 않았습니다: ${reason}\n` +
    `현재 상태 — 거래처: ${state.customer}; ERP 프로젝트: ${state.project}; ` +
    `프로젝트 시트: ${state.projectSheet}; ${sourceSheetLabel}: ${state.sourceSheet}. ` +
    "이미 생성된 거래처·프로젝트는 재시도 때 식별자로 재사용합니다.",
  );
}

interface ProjectConversionInput {
  status: string;
  existingProjectName: string;
  projectMarker: string;
  project: ProjectConversionSeed;
  customer: CustomerConversionSeed;
  appendProjectSheet: (projectName: string, customerName: string) => Promise<{ alreadyExists: boolean }>;
  saveSourceProject: (projectName: string, projectUrl: string) => Promise<{ projectName: string; alreadyLinked: boolean }>;
  sourceSheetLabel: string;
}

async function createProjectFromSource(input: ProjectConversionInput): Promise<CreateInquiryProjectResult> {
  if (input.existingProjectName) {
    const existing = await findProjectByMarker(input.projectMarker, input.existingProjectName);
    if (!existing) {
      throw new Error(`${input.sourceSheetLabel}에 ‘${input.existingProjectName}’이 있지만 ERP 프로젝트를 찾지 못했습니다.`);
    }
    return {
      projectId: existing.id,
      projectName: existing.name,
      projectUrl: projectUrl(existing.id),
      reused: true,
    };
  }
  if (input.status !== "성사") {
    throw new Error("성사 단계의 문의만 프로젝트로 만들 수 있습니다.");
  }
  if (!input.project.name) throw new Error("프로젝트명을 입력해 주세요.");

  const state = {
    customer: "아직 처리하지 않음",
    project: "아직 처리하지 않음",
    projectSheet: "아직 처리하지 않음",
    sourceSheet: "아직 처리하지 않음",
  };
  let project: { id: string; name: string } | null = null;
  let projectWasCreated = false;

  // DB와 Google Sheets는 하나의 트랜잭션이 아니므로 중간 성공을 지우지 않는다.
  // 대신 식별자와 원본 행 재확인으로 다음 시도에서 이어간다.
  try {
    const customerResult = await findOrCreateCustomer(input.customer);
    state.customer = `${customerResult.created ? "새로 생성" : "기존 사용"} ‘${customerResult.customer.name}’`;

    project = await findProjectByMarker(input.projectMarker);
    if (!project) {
      project = await prisma.project.create({
        data: {
          ...projectCreateData(input.project),
          // company는 우리 회사 귀속값(인포피아·노바웨이·클로원)이므로 원청을 넣지 않는다.
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

    const projectSheetResult = await input.appendProjectSheet(project.name, customerResult.customer.name);
    state.projectSheet = projectSheetResult.alreadyExists ? "기존 행 확인" : "행 추가 완료";

    const sourceSheetResult = await input.saveSourceProject(project.name, projectUrl(project.id));
    state.sourceSheet = sourceSheetResult.alreadyLinked ? "기존 연결 확인" : "프로젝트명 기록 완료";

    revalidatePath("/inquiries");
    revalidatePath("/customers");
    revalidatePath("/projects");
    revalidatePath(`/projects/${project.id}`);
    return {
      projectId: project.id,
      projectName: sourceSheetResult.projectName,
      projectUrl: projectUrl(project.id),
      reused: !projectWasCreated,
    };
  } catch (error) {
    throw creationFailureMessage(error, state, input.sourceSheetLabel);
  }
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

export async function updateSpaceRentalStage(identity: SpaceRentalIdentity, nextStage: SpaceRentalStage) {
  await requireEditAccess("inquiries");
  const result = await saveSpaceRentalStage(identity, nextStage);
  revalidatePath("/inquiries");
  return result;
}

export async function createProjectFromInquiry(
  identity: InquiryIdentity,
  requestedProjectName: string,
): Promise<CreateInquiryProjectResult> {
  await requireEditAccess("inquiries");
  await requireEditAccess("customers");
  await requireEditAccess("projects");
  const inquiry = await getInquiryByIdentity(identity);
  const project = inquiryProjectSeed(inquiry, requestedProjectName);
  return createProjectFromSource({
    status: inquiry.status,
    existingProjectName: inquiry.projectName,
    projectMarker: `문의 식별: ${inquiryProjectMarker(inquiry.identity)}`,
    project,
    customer: inquiryCustomerSeed(inquiry),
    appendProjectSheet: (projectName, customerName) => appendInquiryProjectRow(inquiry, projectName, customerName),
    saveSourceProject: (projectName, url) => saveInquiryProject(identity, projectName, url),
    sourceSheetLabel: "문의 시트 N열",
  });
}

export async function createProjectFromSpaceRental(
  identity: SpaceRentalIdentity,
  requestedProjectName: string,
): Promise<CreateInquiryProjectResult> {
  await requireEditAccess("inquiries");
  await requireEditAccess("customers");
  await requireEditAccess("projects");
  const rental = await getSpaceRentalByIdentity(identity);
  const project = spaceRentalProjectSeed(rental, requestedProjectName);
  return createProjectFromSource({
    status: rental.status,
    existingProjectName: rental.projectName,
    projectMarker: `공간대관 식별: ${spaceRentalProjectMarker(rental)}`,
    project,
    customer: spaceRentalCustomerSeed(rental),
    appendProjectSheet: (projectName, customerName) => appendSpaceRentalProjectRow(rental, projectName, customerName),
    saveSourceProject: (projectName, url) => saveSpaceRentalProject(identity, projectName, url),
    sourceSheetLabel: "공간대관 시트 AL열",
  });
}
