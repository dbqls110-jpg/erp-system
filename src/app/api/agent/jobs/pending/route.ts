import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;

// GET /api/agent/jobs/pending?agentType=xxx&limit=5
// Python 브릿지가 주기적으로 폴링해 미처리 작업을 가져온다.
export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const agentType = searchParams.get("agentType") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5"), 10);

  if (!ALLOWED_AGENT_TYPES.includes(agentType as (typeof ALLOWED_AGENT_TYPES)[number])) {
    return NextResponse.json({ error: "agentType은 hermes | marketer" }, { status: 400 });
  }

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
