import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

// 헤르메스가 특정 직원에게 메시지 전송
export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { fromUserId, toUserId, content } = body;

  if (!fromUserId || !toUserId || !content) {
    return NextResponse.json({ error: "fromUserId, toUserId, content 필수" }, { status: 400 });
  }

  // 대화 가져오기 (없으면 생성)
  const [a, b] = [fromUserId, toUserId].sort();
  const conv = await prisma.conversation.upsert({
    where: { participantA_participantB: { participantA: a, participantB: b } },
    create: { participantA: a, participantB: b },
    update: { lastMessageAt: new Date() },
  });

  await prisma.message.create({
    data: { conversationId: conv.id, senderId: fromUserId, content },
  });

  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json({ ok: true, conversationId: conv.id }, { status: 201 });
}

// 헤르메스가 특정 직원과의 대화 내역 조회
export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const userId1 = searchParams.get("userId1");
  const userId2 = searchParams.get("userId2");

  if (!userId1 || !userId2) {
    return NextResponse.json({ error: "userId1, userId2 필수" }, { status: 400 });
  }

  const [a, b] = [userId1, userId2].sort();
  const conv = await prisma.conversation.findUnique({
    where: { participantA_participantB: { participantA: a, participantB: b } },
  });

  if (!conv) return NextResponse.json({ messages: [] });

  const messages = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return NextResponse.json({ conversationId: conv.id, messages });
}
