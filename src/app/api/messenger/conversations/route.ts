import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConversationOther } from "@/lib/messenger-conversation";
import { listVenueDaThreadsForUser } from "@/lib/venueDaMessenger";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.active === false) return NextResponse.json([], { status: 401 });

  const uid = session.user.id;

  const convs = await prisma.conversation.findMany({
    // 상대가 에이전트인 대화는 숨긴다. 파이프라인을 제거해 더는 답하지 않으므로
    // 목록에 남겨두면 "답 없는 유령 대화"가 된다. 데이터는 지우지 않는다.
    where: {
      OR: [{ participantA: uid }, { participantB: uid }],
      userA: { isAgent: false },
      userB: { isAgent: false },
    },
    include: {
      userA: { select: { id: true, name: true, image: true, isAgent: true } },
      userB: { select: { id: true, name: true, image: true, isAgent: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  // 비서 대화의 안 읽은 답·알림. 직원 DM 과 같은 배지에 합산한다 — 폴러를 하나 더 두지 않기 위해 같은 응답에 싣는다.
  const assistantUnread = await prisma.agentJob.count({
    where: { userId: uid, visibility: "user", status: { in: ["completed", "error"] }, seenAt: null },
  });

  // N+1 방지: 내부 대화의 미읽음 수를 한 번에 조회한다.
  const convIds = convs.map(c => c.id);
  const unreadGroups = convIds.length === 0 ? [] : await prisma.message.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: convIds }, senderId: { not: uid }, readAt: null },
    _count: { id: true },
  });
  const unreadMap = Object.fromEntries(unreadGroups.map(u => [u.conversationId, u._count.id]));

  const internalResult = convs.map((c) => ({
    conversationId: c.id,
    other: getConversationOther(c, uid),
    lastMsg: c.messages[0] ?? null,
    unread: unreadMap[c.id] ?? 0,
  }));

  // VenueDA 외부 상담도 같은 목록에 합친다. 이 조회는 역할·담당자 기준으로
  // 내부에서 다시 필터링하므로, URL을 직접 호출해도 다른 상담이 노출되지 않는다.
  const venueDaResult = await listVenueDaThreadsForUser(uid, session.user.role);
  const result = [...internalResult, ...venueDaResult].sort((a, b) => {
    const aTime = a.lastMsg ? new Date(a.lastMsg.createdAt).getTime() : 0;
    const bTime = b.lastMsg ? new Date(b.lastMsg.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return NextResponse.json({ conversations: result, assistantUnread });
}
