"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireMenuEdit } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeCompany, type CompanyFinanceEntryType } from "@/lib/companyFinance";
import { revalidatePath } from "next/cache";

function readText(formData: FormData, field: string, label: string) {
  const value = formData.get(field);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}을(를) 입력해 주세요.`);
  return value.trim();
}

function readDate(formData: FormData) {
  const date = readText(formData, "date", "날짜");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜 형식이 올바르지 않습니다.");
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }
  return date;
}

function readAmount(formData: FormData) {
  const raw = readText(formData, "amount", "금액").replace(/,/g, "");
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("금액은 0보다 큰 숫자로 입력해 주세요.");
  return amount;
}

function readType(formData: FormData): CompanyFinanceEntryType {
  const type = formData.get("type");
  if (type !== "revenue" && type !== "cost") throw new Error("구분을 선택해 주세요.");
  return type;
}

export async function addCompanyFinanceEntry(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  await requireMenuEdit(session.user.id, "companyFinance", session.user.role);

  const company = normalizeCompany(readText(formData, "company", "회사"));
  if (!company) throw new Error("회사 목록에서 선택해 주세요.");

  await prisma.companyFinanceEntry.create({
    data: {
      company,
      type: readType(formData),
      date: readDate(formData),
      title: readText(formData, "title", "항목명"),
      amount: readAmount(formData),
      memo: (formData.get("memo") as string | null)?.trim() || null,
      createdById: session.user.id,
    },
  });

  revalidatePath("/company-finance");
}

export async function deleteCompanyFinanceEntry(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  await requireMenuEdit(session.user.id, "companyFinance", session.user.role);
  if (!id.trim()) throw new Error("삭제할 항목을 찾을 수 없습니다.");

  await prisma.companyFinanceEntry.delete({ where: { id } });
  revalidatePath("/company-finance");
}
