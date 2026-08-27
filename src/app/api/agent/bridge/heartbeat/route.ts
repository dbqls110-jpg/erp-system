import { NextRequest, NextResponse } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { normalizeAgentType } from "@/lib/agentTypes";
import { prisma } from "@/lib/prisma";

interface Body {
  agentType?: string;
  version?: string;
  hostname?: string;
  status?: string;
  lastError?: string | null;
  model?: string;
  effort?: string;
}

// POST /api/agent/bridge/heartbeat
// 브릿지가 30초마다 자기 상태를 올린다. 오류도 여기로 실어 보내면 회사 PC 로그를
// 직접 열지 않고도 무슨 일이 있었는지 조회할 수 있다.
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 옛 이름으로 와도 받아주고, 저장은 정식 이름으로 통일한다. 그러지 않으면
  // 같은 브릿지가 이름만 다른 두 행으로 갈라져 상태를 못 읽는다.
  const agentType = normalizeAgentType(body.agentType ?? "agent-1");
  if (!agentType) {
    return NextResponse.json({ error: "agentType은 agent-1 | agent-2" }, { status: 400 });
  }
  if (!verifyBridgeApiKey(req, agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasError = typeof body.lastError === "string" && body.lastError.trim().length > 0;
  const common = {
    lastSeenAt: new Date(),
    version: body.version ?? null,
    hostname: body.hostname ?? null,
    status: body.status ?? "idle",
    model: body.model ?? null,
    effort: body.effort ?? null,
    // 오류가 없는 하트비트는 이전 오류를 지우지 않는다. 마지막 실패를 조회할 수 있어야 한다.
    ...(hasError ? { lastError: body.lastError!.slice(0, 2000), lastErrorAt: new Date() } : {}),
  };

  const hb = await prisma.agentBridgeHeartbeat.upsert({
    where: { agentType },
    create: { agentType, ...common },
    update: common,
  });

  return NextResponse.json({ ok: true, agentType: hb.agentType, lastSeenAt: hb.lastSeenAt });
}
