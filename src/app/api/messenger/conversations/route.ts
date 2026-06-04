import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const uid = session.user.id;

  const convs = await prisma.conversation.findMany({
    where: { OR: [{ participantA: uid }, { participantB: uid }] },
    include: {
      userA: { select: { id: true, name: true, image: true } },
      userB: { select: { id: true, name: true, image: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (convs.length === 0) return NextResponse.json([]);

  // N+1 방지: 미읽음 수를 한 번에 조회
  const convIds = convs.map(c => c.id);
  const unreadGroups = await prisma.message.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: convIds }, senderId: { not: uid }, readAt: null },
    _count: { id: true },
  });
  const unreadMap = Object.fromEntries(unreadGroups.map(u => [u.conversationId, u._count.id]));

  const result = convs.map((c) => ({
    conversationId: c.id,
    other: c.participantA === uid ? c.userB : c.userA,
    lastMsg: c.messages[0] ?? null,
    unread: unreadMap[c.id] ?? 0,
  }));

  return NextResponse.json(result);
}
