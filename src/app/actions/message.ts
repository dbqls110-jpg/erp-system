"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  deleteDriveFileAsOwner,
  MAX_MESSENGER_FILE_SIZE,
  uploadMessengerFile,
} from "@/lib/googleDrive";

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

export async function sendMessage(receiverId: string, content: string): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!content.trim()) throw new Error("내용을 입력해주세요.");
  const trimmed = content.trim();
  const senderId = session.user.id;

  const conv = await getOrCreateConversation(senderId, receiverId);

  await prisma.message.create({
    data: { conversationId: conv.id, senderId, content: trimmed },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date() },
  });

  revalidatePath("/messenger");
}

export interface SentMessageAttachment {
  driveFileId: string;
  driveUrl: string;
  name: string;
  mimeType: string;
  size: number;
}

/** 텍스트 없이 파일만 보내는 경우도 허용하는 메신저 첨부 전송. */
export async function sendMessageWithAttachment(
  receiverId: string,
  content: string,
  formData: FormData,
): Promise<SentMessageAttachment> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (!receiverId.trim()) throw new Error("받는 사람을 선택해 주세요.");

  const entry = formData.get("file");
  if (!(entry instanceof File) || entry.size === 0) {
    throw new Error("첨부파일을 선택해 주세요.");
  }
  if (entry.size > MAX_MESSENGER_FILE_SIZE) {
    throw new Error("메신저 첨부파일은 50MB 이하만 보낼 수 있습니다.");
  }

  // 브라우저가 보낸 경로 문자열은 파일명으로 저장하지 않는다.
  const name = entry.name.split(/[\\/]/).pop()?.trim() || "첨부파일";
  const uploaded = await uploadMessengerFile({
    buffer: Buffer.from(await entry.arrayBuffer()),
    name,
    mimeType: entry.type || "application/octet-stream",
    size: entry.size,
  });

  try {
    const conv = await getOrCreateConversation(session.user.id, receiverId);
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId: session.user.id,
          content: content.trim(),
          attachmentDriveFileId: uploaded.driveFileId,
          attachmentName: uploaded.name,
          attachmentMimeType: uploaded.mimeType,
          attachmentSizeBytes: uploaded.size,
          attachmentUrl: uploaded.driveUrl,
        },
      }),
      prisma.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch (err) {
    // DB 저장에 실패하면 방금 올린 Drive 파일도 남기지 않는다.
    try {
      await deleteDriveFileAsOwner(uploaded.driveFileId);
    } catch {
      // 원래 저장 오류를 사용자에게 보여주고, 정리 실패는 서버 로그에서 추적한다.
      console.error("[messenger attachment] orphan Drive file cleanup failed", uploaded.driveFileId);
    }
    throw err;
  }

  revalidatePath("/messenger");
  return uploaded;
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
