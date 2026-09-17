import { NextRequest, NextResponse } from "next/server";

import {
  ingestVenueDaVisitorMessage,
  readVenueDaJson,
  requireVenueDaIntegration,
  VenueDaRequestError,
} from "@/lib/venueDaMessenger";

/** VenueDA 방문자의 메시지를 ERP에 저장하는 서버 간 API. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    requireVenueDaIntegration(request);
    const { threadId } = await params;
    const message = await ingestVenueDaVisitorMessage(threadId, await readVenueDaJson(request));
    return NextResponse.json({ messageId: message.id, id: message.id });
  } catch (error) {
    if (error instanceof VenueDaRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[VenueDA] 방문자 메시지 수신 실패", error);
    return NextResponse.json({ error: "메시지를 저장하지 못했습니다." }, { status: 500 });
  }
}
