import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

// POST /api/agent/activity-log
// Hermes의 Discord/외부 활동을 ERP AgentAuditLog에 기록
export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "요청 본문이 필요합니다." }, { status: 400 });

  const { action, context, payload, result } = body;
  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action(string)은 필수입니다." }, { status: 400 });
  }

  const log = await prisma.agentAuditLog.create({
    data: {
      method: "AGENT",
      endpoint: typeof context === "string" && context ? context : "/external",
      action,
      dryRun: false,
      payload: payload && typeof payload === "object" ? (payload as object) : undefined,
      result: result && typeof result === "object" ? (result as object) : undefined,
    },
  });

  return NextResponse.json({ log }, { status: 201 });
}
