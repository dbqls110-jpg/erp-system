import { NextRequest, NextResponse } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { agentTypeAliases, normalizeAgentType } from "@/lib/agentTypes";
import { prisma } from "@/lib/prisma";

// GET /api/agent/bridge/jobs?agentType=hermes
// 브릿지가 처리할 작업을 하나 가져간다(claim). 동시에 두 브릿지가 같은 작업을 잡지
// 않도록 updateMany 의 조건부 갱신으로 원자적으로 선점한다.
export async function GET(req: NextRequest) {
  // 옛 이름(hermes/marketer)으로 와도 받아준다. 회사 PC 의 bridge.env 를 아직
  // 바꾸지 않았어도 브릿지가 죽지 않아야 한다.
  const agentType = normalizeAgentType(req.nextUrl.searchParams.get("agentType") ?? "agent-1");
  if (!agentType) {
    return NextResponse.json({ error: "agentType은 agent-1 | agent-2" }, { status: 400 });
  }
  if (!verifyBridgeApiKey(req, agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await prisma.agentJob.findFirst({
    where: { agentType: { in: agentTypeAliases(agentType) }, status: "pending" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!candidate) return NextResponse.json({ job: null });

  // 선점: 아직 pending 일 때만 accepted 로 바꾼다. 0건이면 다른 쪽이 먼저 가져간 것.
  const claimed = await prisma.agentJob.updateMany({
    where: { id: candidate.id, status: "pending" },
    data: { status: "accepted", claimedAt: new Date() },
  });
  if (claimed.count === 0) return NextResponse.json({ job: null });

  const job = await prisma.agentJob.findUnique({
    where: { id: candidate.id },
    select: { id: true, agentType: true, input: true, userId: true, createdAt: true },
  });

  return NextResponse.json({ job });
}
