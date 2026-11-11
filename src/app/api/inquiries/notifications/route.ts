import { NextResponse } from "next/server";
import { getInquiryUnreadCounts } from "@/lib/inquiryNotifications";
export async function GET() {
  try { return NextResponse.json(await getInquiryUnreadCounts(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : error instanceof Error && error.message === "Forbidden" ? 403 : 503;
    return NextResponse.json({ error: status === 503 ? "문의 알림을 갱신하지 못했습니다." : "접근 권한이 없습니다." }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
