import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    system: "천우영 ERP",
    timestamp: new Date().toISOString(),
  });
}
