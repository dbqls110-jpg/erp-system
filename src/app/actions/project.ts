"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const revenueRaw = formData.get("revenue") as string;
  const costRaw = formData.get("cost") as string;

  await prisma.project.create({
    data: {
      name: formData.get("name") as string,
      client: (formData.get("client") as string) || null,
      announceDate: (formData.get("announceDate") as string) || null,
      deadline: (formData.get("deadline") as string) || null,
      assignee: (formData.get("assignee") as string) || null,
      memo: (formData.get("memo") as string) || null,
      revenue: revenueRaw ? parseFloat(revenueRaw) : null,
      cost: costRaw ? parseFloat(costRaw) : null,
      status: "active",
    },
  });
  revalidatePath("/projects");
}

export async function updateProject(id: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const revenueRaw = formData.get("revenue") as string;
  const costRaw = formData.get("cost") as string;

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
      revenue: revenueRaw ? parseFloat(revenueRaw) : null,
      cost: costRaw ? parseFloat(costRaw) : null,
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
  await prisma.checklistItem.create({
    data: { projectId, content, order: count },
  });
  await updateProgress(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleChecklistItem(itemId: string, projectId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { isDone: !item.isDone },
  });
  await updateProgress(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteChecklistItem(itemId: string, projectId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.checklistItem.delete({ where: { id: itemId } });
  await updateProgress(projectId);
  revalidatePath(`/projects/${projectId}`);
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
