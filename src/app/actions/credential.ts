"use server";

import { prisma } from "@/lib/prisma";
import { requireEditAccess, requireSessionUser } from "@/lib/actionGuards";
import { requireMenuAccess } from "@/lib/permissions";
import { auditLog } from "@/lib/agentAudit";
import { revalidatePath } from "next/cache";

export async function createCredential(data: {
  name: string;
  company?: string;
  category?: string;
  username?: string;
  password?: string;
  memo?: string;
  url?: string;
}) {
  await requireEditAccess("credentials");

  await prisma.credential.create({
    data: {
      name: data.name.trim(),
      company: data.company?.trim() || null,
      category: data.category?.trim() || null,
      username: data.username?.trim() || null,
      password: data.password || null,
      memo: data.memo?.trim() || null,
      url: data.url?.trim() || null,
    },
  });

  revalidatePath("/credentials");
}

export async function updateCredential(
  id: string,
  data: {
    name: string;
    company?: string;
    category?: string;
    username?: string;
    password?: string;
    memo?: string;
    url?: string;
  }
) {
  await requireEditAccess("credentials");

  await prisma.credential.update({
    where: { id },
    data: {
      name: data.name.trim(),
      company: data.company?.trim() || null,
      category: data.category?.trim() || null,
      username: data.username?.trim() || null,
      password: data.password || null,
      memo: data.memo?.trim() || null,
      url: data.url?.trim() || null,
    },
  });

  revalidatePath("/credentials");
}

export async function deleteCredential(id: string) {
  await requireEditAccess("credentials");

  await prisma.credential.delete({ where: { id } });
  revalidatePath("/credentials");
}

/**
 * 민감정보를 표시하거나 클립보드로 내보내기 직전에 서버에서 권한을 다시 확인하고
 * 접근 사실을 감사 로그에 남긴다. 값 자체는 로그에 절대 기록하지 않는다.
 */
export async function auditCredentialAccess(id: string, action: "reveal_username" | "copy_username" | "reveal_password" | "copy_password") {
  const session = await requireSessionUser();
  await requireMenuAccess(session.user.id, "credentials", session.user.role);
  const credential = await prisma.credential.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!credential) throw new Error("인증 정보를 찾을 수 없습니다.");

  await auditLog({
    method: "POST",
    endpoint: "/credentials",
    action: `credential_${action}`,
    dryRun: false,
    payload: { credentialId: credential.id, credentialName: credential.name, userId: session.user.id },
    result: { recorded: true },
  });
}
