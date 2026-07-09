import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";
import { getAgentUser } from "@/lib/agentApi";

// GET /api/agent/messages/history?agentType=marketer&userId=xxx&limit=50
// Hermes가 응답 생성 전 ERP 대화 이력을 context용으로 조회하는 엔드포인트
// role: "agent" | "user" 형태로 반환 → AI context에 바로 삽입 가능

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const agentType = searchParams.get("agentType") ?? "hermes";
  const userId = searchParams.get("userId");
  const limitRaw = parseInt(searchParams.get("limit") ?? "50");
  const limit = isNaN(limitRaw) ? 50 : Math.min(Math.max(1, limitRaw), 200);

  if (!userId) return NextResponse.json({ error: "userId는 필수입니다." }, { status: 400 });

  // 에이전트 계정 조회
  const agentUser = await getAgentUser(agentType);
  if (!agentUser) {
    return NextResponse.json({ error: `agentType=${agentType} 계정을 찾을 수 없습니다.` }, { status: 404 });
  }

  // 상대방 유저 조회
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!targetUser) return NextResponse.json({ error: "userId에 해당하는 유저를 찾을 수 없습니다." }, { status: 404 });

  // 대화 조회
  const [a, b] = [agentUser.id, userId].sort();
  const conversation = await prisma.conversation.findUnique({
    where: { participantA_participantB: { participantA: a, participantB: b } },
    select: { id: true },
  });

  if (!conversation) {
    return NextResponse.json({
      agentType,
      agentUserId: agentUser.id,
      targetUserId: userId,
      targetUserName: targetUser.name,
      conversationId: null,
      messageCount: 0,
      messages: [],
    });
  }

  const rawMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, senderId: true, content: true, createdAt: true },
  });

  // role 필드 추가: agent가 보낸 메시지 → "agent", 상대방 → "user"
  const messages = rawMessages.map((msg) => ({
    id: msg.id,
    role: msg.senderId === agentUser.id ? "agent" : "user",
    content: msg.content,
    createdAt: msg.createdAt,
  }));

  return NextResponse.json({
    agentType,
    agentUserId: agentUser.id,
    targetUserId: userId,
    targetUserName: targetUser.name,
    conversationId: conversation.id,
    messageCount: messages.length,
    messages,
  });
}
