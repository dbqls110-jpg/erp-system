import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;
type AllowedAgentType = (typeof ALLOWED_AGENT_TYPES)[number];

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

  const {
    agentType,
    status = "processed",
    resultMessageId,
    error,
  } = body as {
    agentType?: string;
    status?: string;
    resultMessageId?: string;
    error?: string;
  };

  if (!agentType || !ALLOWED_AGENT_TYPES.includes(agentType as AllowedAgentType)) {
    return NextResponse.json(
      { error: `agentType은 ${ALLOWED_AGENT_TYPES.join(" | ")} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  const allowedStatuses = ["processed", "error"];
  if (!allowedStatuses.includes(status as string)) {
    return NextResponse.json({ error: "status는 processed | error 여야 합니다." }, { status: 400 });
  }

  // 메시지 존재 확인
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true } });
  if (!message) return NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });

  const existing = await prisma.agentMessageProcessing.findUnique({
    where: { messageId_agentType: { messageId, agentType } },
  });

  // 처리 실패(error): claim 해제 → 다음 polling에서 재처리 가능
  if (status === "error") {
    if (existing?.status === "processing") {
      await prisma.agentMessageProcessing.delete({
        where: { messageId_agentType: { messageId, agentType } },
      });
      return NextResponse.json({ ok: true, released: true, message: "처리 실패로 claim 해제됨. 다음 polling에서 재처리 가능합니다." });
    }
    if (existing?.status === "processed") {
      return NextResponse.json({ alreadyProcessed: true, record: { messageId: existing.messageId, agentType: existing.agentType, status: existing.status } });
    }
    return NextResponse.json({ ok: true, note: "해제할 claim이 없습니다." });
  }

  // 처리 완료(processed): processing → processed 전환 또는 신규 생성
  if (existing) {
    if (existing.status === "processed") {
      return NextResponse.json({
        alreadyProcessed: true,
        record: { messageId: existing.messageId, agentType: existing.agentType, status: existing.status, processedAt: existing.processedAt },
      });
    }
    if (existing.status === "processing") {
      const updated = await prisma.agentMessageProcessing.update({
        where: { messageId_agentType: { messageId, agentType } },
        data: { status: "processed", processedAt: new Date(), resultMessageId: resultMessageId ?? null, error: null },
      });
      return NextResponse.json({
        ok: true,
        record: { id: updated.id, messageId: updated.messageId, agentType: updated.agentType, status: updated.status, processedAt: updated.processedAt, resultMessageId: updated.resultMessageId },
      }, { status: 201 });
    }
  }

  const record = await prisma.agentMessageProcessing.create({
    data: {
      messageId,
      agentType,
      status: "processed",
      processedAt: new Date(),
      resultMessageId: resultMessageId ?? null,
      error: error ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    record: {
      id: record.id,
      messageId: record.messageId,
      agentType: record.agentType,
      status: record.status,
      processedAt: record.processedAt,
      resultMessageId: record.resultMessageId,
    },
  }, { status: 201 });
}
