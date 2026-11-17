"use server";

import { revalidatePath } from "next/cache";
import { beginMailboxOAuth } from "@/lib/privateInboxOAuth";
import { connectNaverMailbox, disconnectMailbox, getPrivateInbox, saveInboxFollowUp, syncPrivateMailbox } from "@/lib/privateInbox";

export async function loadPrivateInboxAction() { return getPrivateInbox(); }
export async function beginGmailInboxAction(folder: string) { return beginMailboxOAuth(folder); }
export async function connectNaverInboxAction(input: { email: string; password: string; folder: string }) {
  await connectNaverMailbox(input); revalidatePath("/inquiries"); return getPrivateInbox();
}
export async function syncMailboxAction(id: string) {
  await syncPrivateMailbox(id); return getPrivateInbox();
}
export async function disconnectMailboxAction(id: string) {
  await disconnectMailbox(id); revalidatePath("/inquiries"); return getPrivateInbox();
}
export async function saveFollowUpAction(input: { itemKey: string; dueAt: string; note: string; version: number }) {
  await saveInboxFollowUp(input); revalidatePath("/inquiries"); return getPrivateInbox();
}
