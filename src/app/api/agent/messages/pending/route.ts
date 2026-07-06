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

  const agentUser = await getAgentUser(agentType);

  // "processing" 및 "processed" 모두 차단 (claim 중인 메시지도 제외)
  const blockedProcessings = await prisma.agentMessageProcessing.findMany({
    where: { agentType, status: { in: ["processing", "processed"] } },
    select: { messageId: true },
  });
  const blockedIds = new Set(blockedProcessings.map((p) => p.messageId));

  // 이 에이전트가 직접 참여 중인 1:1 대화방 목록 (키워드 없이도 포함)
  const agentConvIds: Set<string> = new Set();
  if (agentUser) {
    const agentConvs = await prisma.conversation.findMany({
      where: { OR: [{ participantA: agentUser.id }, { participantB: agentUser.id }] },
      select: { id: true },
    });
    agentConvs.forEach((c) => agentConvIds.add(c.id));
  }

  // 다른 에이전트의 전용 1:1 대화방 목록 (키워드 있어도 제외 → 대화 분리)
  const otherAgentUsers = await prisma.user.findMany({
    where: { isAgent: true, agentType: { not: agentType }, active: true },
    select: { id: true },
  });
  const otherAgentConvIds: Set<string> = new Set();
  if (otherAgentUsers.length > 0) {
    const otherConvs = await prisma.conversation.findMany({
      where: {
        OR: otherAgentUsers.flatMap((u) => [{ participantA: u.id }, { participantB: u.id }]),
        ...(agentConvIds.size > 0 ? { NOT: { id: { in: [...agentConvIds] } } } : {}),
      },
      select: { id: true },
    });
    otherConvs.forEach((c) => otherAgentConvIds.add(c.id));
  }

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

  const pending = recentMessages
    .filter((msg) => {
      if (blockedIds.has(msg.id)) return false;
      // 이 에이전트의 1:1 대화방 → 키워드 없어도 포함
      if (agentConvIds.has(msg.conversationId)) return true;
      // 다른 에이전트 전용 1:1 대화방 → 키워드 있어도 제외
      if (otherAgentConvIds.has(msg.conversationId)) return false;
      // 그 외 대화방 → 키워드 기반 라우팅
      return detectAgentMention(msg.content) === agentType;
    })
    .slice(0, limit)
    .map((msg) => ({
      messageId: msg.id,
      conversationId: msg.conversationId,
      senderUserId: msg.senderId,
      senderName: msg.sender.name ?? null,
      replyRecipientId: msg.senderId,
      content: msg.content,
      agentType,
      createdAt: msg.createdAt,
    }));

  return NextResponse.json({ agentType, count: pending.length, messages: pending });
}
