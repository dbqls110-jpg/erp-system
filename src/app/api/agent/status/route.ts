import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import {
  BRIDGE_AGENT_TYPES,
  hasAnyBridgeCredential,
  verifyBridgeApiKey,
  type BridgeAgentType,
} from "@/lib/agentAuth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ONLINE_THRESHOLD_MS = 60_000; // 60초 내 하트비트 = 온라인
const ALLOWED_AGENT_TYPES = BRIDGE_AGENT_TYPES;

interface HeartbeatBody {
  agentType?: string;
  version?: string;
  hostname?: string;
}

// GET /api/agent/status?agentType=hermes — 브릿지 온라인 여부 조회
// 로그인 세션 또는 브릿지 키 필요. 예전에는 완전 무인증이었는데, 익명 요청이 DB 를
// 깨우는 데다 응답에 내부 호스트명과 브릿지 버전이 그대로 실려 나갔다.
// 실제 소비자는 로그인 상태의 AgentStatusBadge 와 브릿지뿐이다.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const agentType = searchParams.get("agentType") ?? "";

  if (!ALLOWED_AGENT_TYPES.includes(agentType as BridgeAgentType)) {
    return NextResponse.json({ error: "agentType은 hermes | marketer" }, { status: 400 });
  }

  if (!hasAnyBridgeCredential(req)) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

  if (!ALLOWED_AGENT_TYPES.includes(agentType as BridgeAgentType)) {
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
