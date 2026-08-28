"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { uploadProjectFile } from "@/app/actions/projectFile";
import { analyzeQuoteFile, type QuoteAnalysis } from "@/lib/quoteParser";

export interface CreateProjectResult {
  projectId: string;
  quoteAnalysis: QuoteAnalysis | null;
  fileUploaded: boolean;
  warning: string | null;
}

function parseOptionalAmount(rawValue: FormDataEntryValue | null, fieldName: string): number | null {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;
  const value = Number(rawValue.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName}은(는) 0 이상의 숫자로 입력해 주세요.`);
  }
  return value;
}

export async function createProject(formData: FormData): Promise<CreateProjectResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const quoteFileEntry = formData.get("quoteFile");
  const quoteFile = quoteFileEntry instanceof File && quoteFileEntry.size > 0 ? quoteFileEntry : null;
  let quoteAnalysis: QuoteAnalysis | null = null;
  if (quoteFile) {
    try {
      quoteAnalysis = await analyzeQuoteFile(quoteFile);
    } catch {
      // 금액 분석 실패가 프로젝트 생성 자체를 막지는 않는다. 원본 파일은 별도로
      // 보관하고, 화면에는 업로드 경고를 돌려 사용자가 직접 금액을 입력하게 한다.
      quoteAnalysis = {
        revenue: null,
        cost: null,
        confidence: "none",
        source: "empty",
        note: "견적서를 읽지 못했습니다. 금액을 직접 확인해 주세요.",
        matchedLabels: [],
      };
    }
  }

  const revenue = parseOptionalAmount(formData.get("revenue"), "매출") ?? quoteAnalysis?.revenue ?? null;
  const cost = parseOptionalAmount(formData.get("cost"), "매입") ?? quoteAnalysis?.cost ?? null;

  const project = await prisma.project.create({
    data: {
      name: formData.get("name") as string,
      client: (formData.get("client") as string) || null,
      announceDate: (formData.get("announceDate") as string) || null,
      deadline: (formData.get("deadline") as string) || null,
      assignee: (formData.get("assignee") as string) || null,
      memo: (formData.get("memo") as string) || null,
      revenue,
      cost,
      status: "active",
    },
  });

  let fileUploaded = false;
  let warning: string | null = null;
  if (quoteFile) {
    if (!session.accessToken) {
      warning = "견적서 금액은 반영했지만 Google Drive 권한이 없어 원본 파일은 저장되지 않았습니다. 재로그인 후 다시 첨부해 주세요.";
    } else {
      try {
        const uploadForm = new FormData();
        uploadForm.set("file", quoteFile);
        await uploadProjectFile(project.id, uploadForm);
        fileUploaded = true;
      } catch {
        warning = "프로젝트는 생성됐지만 견적서 원본 파일 저장에 실패했습니다. 프로젝트 상세에서 다시 첨부해 주세요.";
      }
    }
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);

  return { projectId: project.id, quoteAnalysis, fileUploaded, warning };
}

export async function updateProject(id: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const revenue = parseOptionalAmount(formData.get("revenue"), "매출");
  const cost = parseOptionalAmount(formData.get("cost"), "매입");

  await prisma.project.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      client: (formData.get("client") as string) || null,
      announceDate: (formData.get("announceDate") as string) || null,
      deadline: (formData.get("deadline") as string) || null,
      assignee: (formData.get("assignee") as string) || null,
      memo: (formData.get("memo") as string) || null,
      status: formData.get("status") as string,
      revenue,
      cost,
    },
  });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function deleteProject(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") throw new Error("Unauthorized");
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
}

export async function addChecklistItem(projectId: string, content: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const count = await prisma.checklistItem.count({ where: { projectId } });
  const item = await prisma.checklistItem.create({
    data: { projectId, content, order: count },
    select: { id: true, content: true, isDone: true, completedAt: true },
  });
  await updateProgress(projectId);
  revalidatePath(`/projects/${projectId}`);
  return item;
}

export async function toggleChecklistItem(itemId: string, projectId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  const updated = await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      isDone: !item.isDone,
      // 체크한 시점을 남긴다. 해제하면 지워서 "언제 완료했는지"가 항상 현재 상태와 맞게 유지된다.
      completedAt: !item.isDone ? new Date() : null,
    },
    select: { id: true, content: true, isDone: true, completedAt: true },
  });
  await updateProgress(projectId);
  revalidatePath(`/projects/${projectId}`);
  return updated;
}

export async function deleteChecklistItem(itemId: string, projectId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.checklistItem.delete({ where: { id: itemId } });
  await updateProgress(projectId);
  revalidatePath(`/projects/${projectId}`);
  return { id: itemId };
}

export async function updateProjectMemo(id: string, memo: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.project.update({ where: { id }, data: { memo: memo || null } });
  revalidatePath(`/projects/${id}`);
}

async function updateProgress(projectId: string) {
  const items = await prisma.checklistItem.findMany({ where: { projectId } });
  const total = items.length;
  const done = items.filter((i) => i.isDone).length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  await prisma.project.update({ where: { id: projectId }, data: { progress } });
}
