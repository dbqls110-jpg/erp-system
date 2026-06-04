import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const convs = await prisma.conversation.findMany({
    where: {
      OR: [{ participantA: session.user.id }, { participantB: session.user.id }],
    },
    include: {
      userA: { select: { id: true, name: true, image: true } },
      userB: { select: { id: true, name: true, image: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  const result = await Promise.all(
    convs.map(async (c) => {
      const other = c.participantA === session.user!.id ? c.userB : c.userA;
      const lastMsg = c.messages[0] ?? null;
      const unread = await prisma.message.count({
        where: { conversationId: c.id, senderId: { not: session.user!.id }, readAt: null },
      });
      return { conversationId: c.id, other, lastMsg, unread };
    })
  );

  return NextResponse.json(result);
}
