"use server";

import { revalidatePath } from "next/cache";
import { beginMailboxOAuth } from "@/lib/privateInboxOAuth";
import { connectNaverMailbox, disconnectMailbox, getPrivateInbox, saveInboxFollowUp, syncPrivateMailbox, markPrivateMailRead } from "@/lib/privateInbox";
import type { PrivateInboxView } from "@/lib/privateInboxPolicy";
import { mailboxErrorCode, mailboxErrorMessage } from "@/lib/mailboxErrors";

export async function loadPrivateInboxAction() { return getPrivateInbox(); }
export async function markMailboxReadAction(ids: unknown): Promise<{ ok: true; data: PrivateInboxView } | { ok: false; message: string }> {
  try { await markPrivateMailRead(ids); return { ok: true, data: await getPrivateInbox() }; }
  catch { return { ok: false, message: "메일 확인 처리를 저장하지 못했습니다. 새로고침 후 다시 확인해 주세요." }; }
}
export async function beginGmailInboxAction(folder: string) { return beginMailboxOAuth(folder); }
export async function connectNaverInboxAction(input: { email: string; password: string; folder: string }): Promise<
  { ok: true; data: PrivateInboxView } | { ok: false; message: string }
> {
  try { await connectNaverMailbox(input); }
  catch (error) {
    // 예상 연결 실패를 throw하면 React 운영 빌드가 안내문을 #441로 바꾼다.
    return { ok: false, message: mailboxErrorMessage(mailboxErrorCode(error), "naver") };
  }
  try { return { ok: true, data: await getPrivateInbox() }; }
  catch { return { ok: false, message: "네이버 연결은 저장됐지만 목록을 불러오지 못했습니다. 화면을 새로고침해 확인해 주세요." }; }
}
export async function syncMailboxAction(id: string): Promise<{ ok: true; data: PrivateInboxView } | { ok: false; message: string; data: PrivateInboxView | null }> {
  try { await syncPrivateMailbox(id); return { ok: true, data: await getPrivateInbox() }; }
  catch (error) {
    const message = mailboxErrorMessage(mailboxErrorCode(error));
    try { return { ok: false, message, data: await getPrivateInbox() }; }
    catch { return { ok: false, message, data: null }; }
  }
}
export async function disconnectMailboxAction(id: string) {
  await disconnectMailbox(id); revalidatePath("/inquiries"); return getPrivateInbox();
}
export async function saveFollowUpAction(input: { itemKey: string; dueAt: string; note: string; version: number }) {
  await saveInboxFollowUp(input); revalidatePath("/inquiries"); return getPrivateInbox();
}
