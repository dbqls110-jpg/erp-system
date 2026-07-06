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

export async function sendMessage(receiverId: string, content: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!content.trim()) throw new Error("내용을 입력해주세요.");

  const conv = await getOrCreateConversation(session.user.id, receiverId);

  await prisma.message.create({
    data: { conversationId: conv.id, senderId: session.user.id, content: content.trim() },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date() },
  });

  // 에이전트 키워드가 포함된 메시지면 웹훅 발송 (fire-and-forget, 메시지 저장을 블록하지 않음)
  const mentionedAgent = detectAgentMention(content);
  if (mentionedAgent) {
    const sender = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });
    void dispatchHermesWebhook({
      event: "messenger.mention",
      agentType: mentionedAgent,
      senderId: session.user.id,
      senderName: sender?.name ?? undefined,
      conversationId: conv.id,
      content: content.trim(),
      timestamp: new Date().toISOString(),
    });
  }

  revalidatePath("/messenger");
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
