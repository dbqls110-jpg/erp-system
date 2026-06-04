import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";
import { getHermesUser, getOrCreateConversation } from "@/lib/agentApi";

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { recipientUserId, content } = body;

  if (!recipientUserId) return NextResponse.json({ error: "recipientUserId는 필수입니다." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "content는 필수입니다." }, { status: 400 });

  const hermesUser = await getHermesUser();
  if (!hermesUser) {
    return NextResponse.json({
      error: "Hermes 계정(ybsw1220@gmail.com)을 찾을 수 없습니다. 먼저 해당 계정으로 ERP에 로그인해주세요.",
    }, { status: 400 });
  }

  const conversation = await getOrCreateConversation(hermesUser.id, recipientUserId);

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: hermesUser.id,
      content,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json({ conversation, message }, { status: 201 });
}

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const userId1 = searchParams.get("userId1");
  const userId2 = searchParams.get("userId2");

  if (!userId1 || !userId2) {
    return NextResponse.json({ error: "userId1, userId2는 필수입니다." }, { status: 400 });
  }

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
