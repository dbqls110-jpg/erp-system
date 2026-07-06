import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { getHermesUser } from "@/lib/agentApi";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hermesUser = await getHermesUser();

  return NextResponse.json({
    status: "ok",
    system: "천우영 ERP",
    timestamp: new Date().toISOString(),
    agent: hermesUser
      ? {
          id: hermesUser.id,
          name: hermesUser.name,
          email: hermesUser.email,
          isAgent: hermesUser.isAgent,
          agentType: hermesUser.agentType,
          role: hermesUser.role,
        }
      : null,
  });
}
