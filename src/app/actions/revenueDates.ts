"use server";

import { revalidatePath } from "next/cache";
import { requireEditAccess } from "@/lib/actionGuards";
import { prisma } from "@/lib/prisma";
import { revenueDatesFromForm } from "@/lib/revenueDates";
import { assertCanEditRevenueDates } from "@/lib/revenueDateAccess";

export async function updateRevenueDates(source: "entry" | "project", id: string, form: FormData) {
  if (source !== "entry" && source !== "project") throw new Error("매출 구분이 올바르지 않습니다.");
  const session = await requireEditAccess(source === "entry" ? "companyFinance" : "projects");
  assertCanEditRevenueDates(session.user);
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("매출 항목이 올바르지 않습니다.");
  const dates = revenueDatesFromForm(form);
  if (source === "entry") {
    const result = await prisma.companyFinanceEntry.updateMany({ where: { id, type: "revenue" }, data: { ...dates, date: "" } });
    if (result.count !== 1) throw new Error("매출 항목을 찾을 수 없습니다.");
  } else {
    const amount = await prisma.projectAmount.findUnique({ where: { id }, select: { projectId: true, kind: true } });
    if (!amount || amount.kind !== "revenue") throw new Error("매출 항목을 찾을 수 없습니다.");
    const result = await prisma.projectAmount.updateMany({ where: { id, projectId: amount.projectId, kind: "revenue" }, data: dates });
    if (result.count !== 1) throw new Error("매출 항목을 찾을 수 없습니다.");
    revalidatePath(`/projects/${amount.projectId}`);
  }
  for (const path of ["/company-finance", "/finance", "/projects", "/projects/stats", "/dashboard"]) revalidatePath(path);
}
