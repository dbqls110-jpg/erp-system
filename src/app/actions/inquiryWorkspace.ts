"use server";

import { getPrivateInbox } from "@/lib/privateInbox";
import { getProjectContacts } from "@/lib/projectContacts";

export async function loadUnifiedInboxAction() {
  const [mail, projects] = await Promise.allSettled([getPrivateInbox(), getProjectContacts()]);
  return {
    mail: mail.status === "fulfilled" ? { ok: true as const, data: mail.value } : { ok: false as const, message: "내 메일·연락 일정을 불러오지 못했습니다. 홈페이지 문의는 계속 확인할 수 있습니다." },
    projects: projects.status === "fulfilled" ? { ok: true as const, data: projects.value } : { ok: false as const, message: "프로젝트 연락 상태를 불러오지 못했습니다. 프로젝트 접근 권한과 저장 상태를 확인해 주세요." },
  };
}
