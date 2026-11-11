"use server";
import { recordInquiryRead } from "@/lib/inquiryNotifications";
export async function markInquiryRead(keys: unknown) { return recordInquiryRead(keys); }
