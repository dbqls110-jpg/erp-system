import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;
type AllowedAgentType = (typeof ALLOWED_AGENT_TYPES)[number];

// POST /api/agent/messages/:id/claim
// 메시지 처리 시작 전 원자적으로 claim. 이미 처리 중/완료 시 claimed: false 반환.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: messageId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentType } = body as { agentType?: string };

  if (!agentType || !ALLOWED_AGENT_TYPES.includes(agentType as AllowedAgentType)) {
    return NextResponse.json(
      { error: `agentType은 ${ALLOWED_AGENT_TYPES.join(" | ")} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true } });
  if (!message) return NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });

  try {
    const record = await prisma.agentMessageProcessing.create({
      data: { messageId, agentType, status: "processing", processedAt: null },
    });
    return NextResponse.json({
      claimed: true,
      record: { id: record.id, messageId, agentType, status: "processing", createdAt: record.createdAt },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.agentMessageProcessing.findUnique({
        where: { messageId_agentType: { messageId, agentType } },
        select: { status: true, createdAt: true },
      });
      return NextResponse.json({
        claimed: false,
        existing: { status: existing?.status ?? "unknown", createdAt: existing?.createdAt ?? null },
      });
    }
    throw e;
  }
}
