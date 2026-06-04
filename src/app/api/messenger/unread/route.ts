import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ count: 0 });

  const uid = session.user.id;

  // 내가 참여한 대화 ID 목록
  const myConvs = await prisma.conversation.findMany({
    where: { OR: [{ participantA: uid }, { participantB: uid }] },
    select: { id: true },
  });
  const convIds = myConvs.map(c => c.id);

  if (convIds.length === 0) return NextResponse.json({ count: 0 });

  // 그 대화에서 내가 안 읽은 메시지 수
  const count = await prisma.message.count({
    where: {
      conversationId: { in: convIds },
      senderId: { not: uid },
      readAt: null,
    },
  });

  return NextResponse.json({ count });
}
