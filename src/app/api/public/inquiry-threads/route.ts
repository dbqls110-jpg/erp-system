import { NextRequest, NextResponse } from "next/server";

import {
  ingestVenueDaThread,
  readVenueDaJson,
  requireVenueDaIntegration,
  VenueDaRequestError,
} from "@/lib/venueDaMessenger";

/** VenueDA가 상담방을 만들거나 재전송할 때 호출하는 서버 간 API. */
export async function POST(request: NextRequest) {
  try {
    requireVenueDaIntegration(request);
    const thread = await ingestVenueDaThread(await readVenueDaJson(request));
    return NextResponse.json({ threadId: thread.id, id: thread.id });
  } catch (error) {
    if (error instanceof VenueDaRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[VenueDA] 상담방 수신 실패", error);
    return NextResponse.json({ error: "상담방을 저장하지 못했습니다." }, { status: 500 });
  }
}
