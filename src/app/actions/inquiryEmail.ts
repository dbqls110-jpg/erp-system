"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { beginInquiryEmailOAuth } from "@/lib/inquiryEmailOAuth";
import { enableInquiryEmails, pauseInquiryEmails } from "@/lib/inquiryEmail";

export async function connectInquiryEmail() { redirect(await beginInquiryEmailOAuth()); }
export async function resumeInquiryEmail() { await enableInquiryEmails(); revalidatePath("/inquiries"); }
export async function pauseInquiryEmail() { await pauseInquiryEmails(); revalidatePath("/inquiries"); }
