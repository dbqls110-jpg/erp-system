import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$executeRaw`ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "notionPageId" TEXT`;
    return NextResponse.json({ ok: true, message: "notionPageId 컬럼 추가 완료" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
