"use server";
import { revalidatePath } from "next/cache";
import { listPartyQuoteRows, recoverPartyQuotes, savePartyQuote } from "@/lib/partyQuotes";

export async function listPartyQuotes(target: unknown) { return listPartyQuoteRows(target); }
export async function uploadPartyQuote(target: unknown, data: FormData) {
  const result = await savePartyQuote(target, data);
  revalidatePath("/customers"); revalidatePath("/partners");
  return result;
}
export async function retryPartyQuotes(target: unknown) {
  const result = await recoverPartyQuotes(target);
  revalidatePath("/customers"); revalidatePath("/partners");
  return result;
}
