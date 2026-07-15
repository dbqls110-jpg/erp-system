import { NextRequest, NextResponse } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

const ONLINE_THRESHOLD_MS = 60_000; // 60초 내 하트비트 = 온라인
const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;

interface HeartbeatBody {
  agentType?: string;
  version?: string;
  hostname?: string;
}

// GET /api/agent/status?agentType=hermes — 브릿지 온라인 여부 조회 (인증 불필요, 세션도 불필요)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const agentType = searchParams.get("agentType") ?? "";

  if (!ALLOWED_AGENT_TYPES.includes(agentType as (typeof ALLOWED_AGENT_TYPES)[number])) {
    return NextResponse.json({ error: "agentType은 hermes | marketer" }, { status: 400 });
  }

  const hb = await prisma.agentBridgeHeartbeat.findUnique({ where: { agentType } });
  if (!hb) {
    return NextResponse.json({ agentType, online: false, lastSeenAt: null });
  }

  const online = Date.now() - hb.lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
  return NextResponse.json({
    agentType,
    online,
    lastSeenAt: hb.lastSeenAt,
    version: hb.version,
    hostname: hb.hostname,
  });
}

// POST /api/agent/status — 브릿지 하트비트 (agentType 전용 키 인증)
export async function POST(req: NextRequest) {
  let body: HeartbeatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentType = "hermes", version, hostname } = body;

  if (!ALLOWED_AGENT_TYPES.includes(agentType as (typeof ALLOWED_AGENT_TYPES)[number])) {
    return NextResponse.json({ error: "agentType은 hermes | marketer" }, { status: 400 });
  }

  if (!verifyBridgeApiKey(req, agentType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hb = await prisma.agentBridgeHeartbeat.upsert({
    where: { agentType },
    create: {
      agentType,
      lastSeenAt: new Date(),
      version: version ?? null,
      hostname: hostname ?? null,
    },
    update: {
      lastSeenAt: new Date(),
      version: version ?? undefined,
      hostname: hostname ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, agentType, lastSeenAt: hb.lastSeenAt });
}
