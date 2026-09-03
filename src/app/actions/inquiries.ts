"use server";

import { revalidatePath } from "next/cache";
import { requireEditAccess } from "@/lib/actionGuards";
import { saveInquiryMemo, saveInquiryStage } from "@/lib/inquirySheet";
import type { InquiryIdentity, InquiryStage } from "@/lib/inquiries";

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
