"use server";

import { revalidatePath } from "next/cache";
import { getProjectContacts, recordProjectContact } from "@/lib/projectContacts";
import { ProjectContactInputError } from "@/lib/projectContactPolicy";

export async function loadProjectContactsAction() {
  try { return { ok: true as const, data: await getProjectContacts() }; }
  catch { return { ok: false as const, message: "프로젝트 연락 상태를 불러오지 못했습니다. 프로젝트 접근 권한과 저장 상태를 확인해 주세요." }; }
}
export async function recordProjectContactAction(input: unknown) {
  try {
    const data = await recordProjectContact(input);
    revalidatePath("/projects"); revalidatePath(`/projects/${data.id}`); revalidatePath("/inquiries");
    return { ok: true as const, data };
  } catch (error) {
    return { ok: false as const, message: error instanceof ProjectContactInputError ? error.message : "연락 기록을 저장하지 못했습니다. 권한을 확인하고 새로고침 후 다시 시도해 주세요." };
  }
}
