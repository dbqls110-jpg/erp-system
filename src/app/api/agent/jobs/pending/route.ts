import { NextRequest, NextResponse } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;

// GET /api/agent/jobs/pending?agentType=xxx&limit=5
// Python 브릿지가 재연결 시 한 번만 호출해 밀린 pending 작업을 복구한다.
// agentType별 전용 키(HERMES_BRIDGE_API_KEY / MARKETER_BRIDGE_API_KEY)로 인증.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const agentType = searchParams.get("agentType") ?? "";

  if (!ALLOWED_AGENT_TYPES.includes(agentType as (typeof ALLOWED_AGENT_TYPES)[number])) {
    return NextResponse.json({ error: "agentType은 hermes | marketer" }, { status: 400 });
  }

  if (!verifyBridgeApiKey(req, agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 20);

  const jobs = await prisma.agentJob.findMany({
    where: { agentType, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      agentType: true,
      userId: true,
      input: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ agentType, count: jobs.length, jobs });
}
