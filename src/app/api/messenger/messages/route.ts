import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { listVenueDaMessages } from "@/lib/venueDaMessenger";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.active === false) return NextResponse.json([], { status: 401 });

  const convId = req.nextUrl.searchParams.get("conversationId");
  if (!convId) return NextResponse.json([]);

  if (convId.startsWith("venueda:")) {
    const threadId = convId.slice("venueda:".length);
    const messages = await listVenueDaMessages(threadId, session.user.id, session.user.role);
    if (!messages) return NextResponse.json({ error: "상담을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(messages);
  }

  const conv = await prisma.conversation.findUnique({ where: { id: convId } });
  if (!conv) return NextResponse.json([]);
  if (conv.participantA !== session.user.id && conv.participantB !== session.user.id) {
    return NextResponse.json([], { status: 403 });
  }

  // 미읽음 여부 먼저 확인 후 updateMany (불필요한 쓰기 방지)
  const hasUnread = await prisma.message.count({
    where: { conversationId: convId, senderId: { not: session.user.id }, readAt: null },
  });
  if (hasUnread > 0) {
    await prisma.message.updateMany({
      where: { conversationId: convId, senderId: { not: session.user.id }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages);
}
