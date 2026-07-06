import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";
import { getAgentUser } from "@/lib/agentApi";
import { detectAgentMention } from "@/lib/hermesWebhook";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;
type AllowedAgentType = (typeof ALLOWED_AGENT_TYPES)[number];

const SCAN_DAYS = 7;
const SCAN_LIMIT = 500;

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const agentType = searchParams.get("agentType") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  if (!ALLOWED_AGENT_TYPES.includes(agentType as AllowedAgentType)) {
    return NextResponse.json(
      { error: `agentType은 ${ALLOWED_AGENT_TYPES.join(" | ")} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  // 에이전트 자신의 userId 확인 (자기 메시지 제외용)
  const agentUser = await getAgentUser(agentType);

  // 이미 처리된 messageId 목록
  const processed = await prisma.agentMessageProcessing.findMany({
    where: { agentType },
    select: { messageId: true },
  });
  const processedIds = new Set(processed.map((p) => p.messageId));

  // 최근 SCAN_DAYS일 메시지 스캔 (에이전트 자신 발신 제외)
  const since = new Date(Date.now() - SCAN_DAYS * 24 * 60 * 60 * 1000);
  const recentMessages = await prisma.message.findMany({
    where: {
      createdAt: { gte: since },
      ...(agentUser ? { senderId: { not: agentUser.id } } : {}),
    },
    include: {
      sender: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: SCAN_LIMIT,
  });

  // agentType 키워드 매칭 + 처리 완료 제외
  const pending = recentMessages
    .filter((msg) => !processedIds.has(msg.id) && detectAgentMention(msg.content) === agentType)
    .slice(0, limit)
    .map((msg) => ({
      messageId: msg.id,
      conversationId: msg.conversationId,
      senderUserId: msg.senderId,
      senderName: msg.sender.name ?? null,
      // 에이전트가 답장할 때 사용할 userId (conversationId 대신 recipientUserId로 사용 권장)
      replyRecipientId: msg.senderId,
      content: msg.content,
      agentType,
      createdAt: msg.createdAt,
    }));

  return NextResponse.json({ agentType, count: pending.length, messages: pending });
}
