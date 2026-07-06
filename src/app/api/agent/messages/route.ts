import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";
import { getAgentUser, getOrCreateConversation } from "@/lib/agentApi";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { agentType, recipientUserId, conversationId, content, dryRun } = body as {
    agentType?: string;
    recipientUserId?: string;
    conversationId?: string;
    content?: string;
    dryRun?: boolean;
  };

  if (!content) return NextResponse.json({ error: "content는 필수입니다." }, { status: 400 });
  if (!recipientUserId && !conversationId) {
    return NextResponse.json({ error: "recipientUserId 또는 conversationId 중 하나가 필요합니다." }, { status: 400 });
  }

  // agentType이 있으면 해당 에이전트 계정을 sender로 사용, 없으면 Hermes(기본)
  const resolvedAgentType =
    agentType && ALLOWED_AGENT_TYPES.includes(agentType as (typeof ALLOWED_AGENT_TYPES)[number])
      ? agentType
      : "hermes";

  const senderUser = await getAgentUser(resolvedAgentType);
  if (!senderUser) {
    return NextResponse.json(
      { error: `agentType=${resolvedAgentType} 계정을 찾을 수 없습니다.` },
      { status: 500 }
    );
  }

  // 대화 확정
  let conversation: { id: string };
  if (conversationId) {
    const found = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, participantA: true, participantB: true },
    });
    if (!found) return NextResponse.json({ error: "conversationId를 찾을 수 없습니다." }, { status: 404 });

    const isParticipant = found.participantA === senderUser.id || found.participantB === senderUser.id;
    if (isParticipant) {
      conversation = { id: found.id };
    } else {
      // 에이전트가 해당 대화 참여자가 아닌 경우 → 비에이전트 참여자와 에이전트↔유저 대화 생성
      // (예: 직원↔헤르메스 conversationId로 마케터가 답장 시도 → 직원↔마케터 대화로 자동 전환)
      const humanParticipant = await prisma.user.findFirst({
        where: {
          id: { in: [found.participantA, found.participantB] },
          isAgent: false,
        },
        select: { id: true },
      });
      if (!humanParticipant) {
        return NextResponse.json(
          { error: "에이전트가 해당 대화의 참여자가 아닙니다. recipientUserId를 직접 지정하세요." },
          { status: 400 }
        );
      }
      conversation = await getOrCreateConversation(senderUser.id, humanParticipant.id);
    }
  } else {
    const recipient = await prisma.user.findUnique({
      where: { id: recipientUserId! },
      select: { id: true, name: true },
    });
    if (!recipient) return NextResponse.json({ error: "수신자를 찾을 수 없습니다." }, { status: 404 });
    conversation = await getOrCreateConversation(senderUser.id, recipient.id);
  }

  const payload = { agentType: resolvedAgentType, from: senderUser.id, conversationId: conversation.id, content };

  if (dryRun === true) {
    await auditLog({ method: "POST", endpoint: "/api/agent/messages", action: "send_message", dryRun: true, payload });
    return NextResponse.json({
      dryRun: true,
      preview: { sender: { id: senderUser.id, name: senderUser.name, agentType: resolvedAgentType }, conversationId: conversation.id, content },
      message: "dryRun=true: 실제 전송되지 않았습니다.",
    });
  }

  const message = await prisma.message.create({
    data: { conversationId: conversation.id, senderId: senderUser.id, content },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  await auditLog({
    method: "POST",
    endpoint: "/api/agent/messages",
    action: "send_message",
    dryRun: false,
    payload,
    result: { messageId: message.id },
  });

  return NextResponse.json({ conversation, message }, { status: 201 });
}

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const userId1 = searchParams.get("userId1");
  const userId2 = searchParams.get("userId2");

  if (!userId1 || !userId2) return NextResponse.json({ error: "userId1, userId2는 필수입니다." }, { status: 400 });

  const [a, b] = [userId1, userId2].sort();
  const conversation = await prisma.conversation.findUnique({
    where: { participantA_participantB: { participantA: a, participantB: b } },
  });

  if (!conversation) return NextResponse.json({ conversation: null, messages: [] });

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json({ conversation, messages });
}
