import { NextRequest, NextResponse } from "next/server";

import {
  readVenueDaJson,
  requireVenueDaIntegration,
  summarizeVenueDaThread,
  VenueDaRequestError,
} from "@/lib/venueDaMessenger";

/** VenueDA가 요청할 때 상담 전체의 서버 저장 요약을 반환한다. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    requireVenueDaIntegration(request);
    // 요청 본문은 계약 호환을 위해 읽지만, 신뢰할 수 있는 ERP 저장 메시지만 요약한다.
    await readVenueDaJson(request);
    const { threadId } = await params;
    const summary = await summarizeVenueDaThread(threadId);
    return NextResponse.json({ summary, result: { summary } });
  } catch (error) {
    if (error instanceof VenueDaRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[VenueDA] 상담 요약 실패", error);
    return NextResponse.json({ error: "상담을 요약하지 못했습니다." }, { status: 500 });
  }
}
