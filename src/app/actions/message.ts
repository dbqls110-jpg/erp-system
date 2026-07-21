"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { detectAgentMention, dispatchHermesWebhook } from "@/lib/hermesWebhook";

// 대화 가져오기 (없으면 생성)
async function getOrCreateConversation(userAId: string, userBId: string) {
  const [a, b] = [userAId, userBId].sort();
  const existing = await prisma.conversation.findUnique({
    where: { participantA_participantB: { participantA: a, participantB: b } },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { participantA: a, participantB: b },
  });
}

// /api/agent/status 의 온라인 판정 기준(60초)과 동일한 로직을 재사용.
// 브릿지가 붙어 있는 agentType만 신규 agent_jobs 경로를 타고,
// 아직 브릿지가 안 붙은 agentType(현재 hermes)은 자동으로 기존 경로를 유지한다.
const BRIDGE_ONLINE_THRESHOLD_MS = 60_000;
async function isBridgeOnline(agentType: string): Promise<boolean> {
  const hb = await prisma.agentBridgeHeartbeat.findUnique({ where: { agentType } });
  if (!hb) return false;
  return Date.now() - hb.lastSeenAt.getTime() < BRIDGE_ONLINE_THRESHOLD_MS;
}

export async function sendMessage(receiverId: string, content: string): Promise<{ jobId?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!content.trim()) throw new Error("내용을 입력해주세요.");
  const trimmed = content.trim();
  const senderId = session.user.id;

  const conv = await getOrCreateConversation(senderId, receiverId);

  // 수신자가 에이전트인지, 그 에이전트의 브릿지가 지금 온라인인지 서버에서 직접 조회
  // (클라이언트가 agentType이나 온라인 여부를 위조할 수 없음)
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { isAgent: true, agentType: true },
  });

  const agentType = receiver?.isAgent ? receiver.agentType : null;
  const useRealtimePipeline = agentType ? await isBridgeOnline(agentType) : false;

  if (agentType && useRealtimePipeline) {
    // 신규 실시간 파이프라인: 메시지 저장 + 구형 폴링 차단 + AgentJob 생성을 한 트랜잭션으로
    const { jobId } = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId: conv.id, senderId, content: trimmed },
      });
      await tx.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: new Date() },
      });
      // 구형 /pending 폴링이 이 messageId를 자동으로 건너뛰도록 즉시 processing으로 마킹
      await tx.agentMessageProcessing.create({
        data: { messageId: message.id, agentType, status: "processing" },
      });
      const job = await tx.agentJob.create({
        data: {
          agentType,
          userId: senderId,
          input: trimmed,
          sourceMessageId: message.id,
        },
      });
      return { jobId: job.id };
    });

    revalidatePath("/messenger");
    return { jobId };
  }

  // 기존 경로 (일반 사용자 / 브릿지가 아직 온라인이 아닌 에이전트) — 변경 없음
  await prisma.message.create({
    data: { conversationId: conv.id, senderId, content: trimmed },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date() },
  });

  // 에이전트 키워드가 포함된 메시지면 웹훅 발송 (fire-and-forget, 메시지 저장을 블록하지 않음)
  const mentionedAgent = detectAgentMention(trimmed);
  if (mentionedAgent) {
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });
    void dispatchHermesWebhook({
      event: "messenger.mention",
      agentType: mentionedAgent,
      senderId,
      senderName: sender?.name ?? undefined,
      conversationId: conv.id,
      content: trimmed,
      timestamp: new Date().toISOString(),
    });
  }

  revalidatePath("/messenger");
  return {};
}

export async function markAsRead(conversationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: session.user.id },
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  revalidatePath("/messenger");
}

export async function getConversationMessages(conversationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}

export async function getMyConversations() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

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

  return convs.map((c) => {
    const other = c.participantA === session.user!.id ? c.userB : c.userA;
    const lastMsg = c.messages[0] ?? null;
    return { conversationId: c.id, other, lastMsg };
  });
}

export async function getUnreadCount() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return 0;

  return prisma.message.count({
    where: {
      senderId: { not: session.user.id },
      readAt: null,
      conversation: {
        OR: [{ participantA: session.user.id }, { participantB: session.user.id }],
      },
    },
  });
}
