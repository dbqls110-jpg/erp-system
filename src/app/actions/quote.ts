"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeQuoteFile, type QuoteAnalysis } from "@/lib/quoteParser";

/** 프로젝트 등록 전에 견적서 금액을 미리 보여 주기 위한 서버 분석 action. */
export async function analyzeQuote(formData: FormData): Promise<QuoteAnalysis> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("견적서 파일을 선택해 주세요.");

  return analyzeQuoteFile(file);
}
