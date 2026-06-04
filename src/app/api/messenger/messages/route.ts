import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const convId = req.nextUrl.searchParams.get("conversationId");
  if (!convId) return NextResponse.json([]);

  const conv = await prisma.conversation.findUnique({ where: { id: convId } });
  if (!conv) return NextResponse.json([]);
  if (conv.participantA !== session.user.id && conv.participantB !== session.user.id) {
    return NextResponse.json([], { status: 403 });
  }

  // 읽음 처리
  await prisma.message.updateMany({
    where: { conversationId: convId, senderId: { not: session.user.id }, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.message.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages);
}
