import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * VenueDA 방문자 상담과 ERP 메신저를 연결하는 서버 전용 모듈.
 *
 * 방문자는 ERP User 계정이 없으므로 내부 Conversation/Message 테이블에 억지로
 * 넣지 않고 전용 테이블에 저장한다. 메신저 화면에서는 source=venueda인 대화로
 * 합쳐 보여 주며, 이 모듈이 외부 ID와 ERP 내부 ID를 계속 매핑한다.
 */

export const VENUEDA_DEFAULT_ASSIGNEE_EMAIL = "qkrtjrdud952@gmail.com";
const MAX_BODY_BYTES = 200_000;
const MAX_ATTACHMENTS = 10;

export class VenueDaRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "VenueDaRequestError";
    this.status = status;
  }
}

function nonEmpty(value: unknown, field: string, required: true): string;
function nonEmpty(value: unknown, field: string): string;
function nonEmpty(value: unknown, field: string, required?: false): string | null;
function nonEmpty(value: unknown, field: string, required = true): string | null {
  if (typeof value !== "string") {
    if (required) throw new VenueDaRequestError(400, `${field} 값이 필요합니다.`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new VenueDaRequestError(400, `${field} 값이 필요합니다.`);
    return null;
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedAttachments(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new VenueDaRequestError(400, "첨부파일 형식이 올바르지 않습니다.");
  if (value.length > MAX_ATTACHMENTS) {
    throw new VenueDaRequestError(400, `첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 보낼 수 있습니다.`);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) throw new VenueDaRequestError(400, `첨부파일 ${index + 1} 형식이 올바르지 않습니다.`);
    const id = nonEmpty(item.id, `첨부파일 ${index + 1} ID`);
    const name = nonEmpty(item.name, `첨부파일 ${index + 1} 이름`);
    const mime = nonEmpty(item.mime ?? item.mimeType, `첨부파일 ${index + 1} MIME`, false);
    const size = typeof item.size === "number" && Number.isFinite(item.size) && item.size >= 0 ? item.size : 0;
    return { id, name, mime, size };
  });
}

/** 외부 연동용 Bearer 인증. 실패 사유에 비밀값을 포함하지 않는다. */
export function requireVenueDaIntegration(request: Request): void {
  const expected = process.env.VENUEDA_INTEGRATION_SECRET?.trim();
  if (!expected) throw new VenueDaRequestError(503, "VenueDA 연동이 설정되지 않았습니다.");

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new VenueDaRequestError(401, "인증이 필요합니다.");
  }

  const expectedBytes = Buffer.from(expected);
  const tokenBytes = Buffer.from(token);
  if (expectedBytes.length !== tokenBytes.length || !timingSafeEqual(expectedBytes, tokenBytes)) {
    throw new VenueDaRequestError(401, "인증이 필요합니다.");
  }
}

/** JSON 본문을 읽되, 잘못된 JSON/너무 큰 요청은 일관된 400으로 돌려준다. */
export async function readVenueDaJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new VenueDaRequestError(413, "요청 본문이 너무 큽니다.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new VenueDaRequestError(415, "JSON 본문이 필요합니다.");
  }
  if (!isRecord(value)) throw new VenueDaRequestError(400, "요청 형식이 올바르지 않습니다.");
  return value;
}

async function defaultAssigneeId() {
  const email = process.env.VENUEDA_DEFAULT_ASSIGNEE_EMAIL?.trim() || VENUEDA_DEFAULT_ASSIGNEE_EMAIL;
  const user = await prisma.user.findFirst({
    where: { email, active: true, isAgent: false, role: { not: "pending" } },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function ingestVenueDaThread(payload: Record<string, unknown>) {
  const externalThreadId = nonEmpty(payload.threadId, "threadId", true);
  const memberId = nonEmpty(payload.memberId, "memberId", false);
  const memberEmail = nonEmpty(payload.memberEmail, "memberEmail", false);
  const subject = nonEmpty(payload.subject, "subject", false) || "베뉴다 상담";
  const context: Prisma.InputJsonValue | undefined = payload.context === undefined || payload.context === null
    ? undefined
    : isRecord(payload.context)
      ? payload.context as Prisma.InputJsonObject
      : (() => { throw new VenueDaRequestError(400, "context 형식이 올바르지 않습니다."); })();

  const existing = await prisma.venueDaThread.findUnique({ where: { externalThreadId } });
  const assigneeId = existing?.assigneeId ?? await defaultAssigneeId();
  const thread = await prisma.venueDaThread.upsert({
    where: { externalThreadId },
    create: { externalThreadId, memberId: memberId ?? undefined, memberEmail: memberEmail ?? undefined, subject, context, assigneeId: assigneeId ?? undefined },
    update: {
      memberId: memberId ?? undefined,
      memberEmail: memberEmail ?? undefined,
      subject,
      context,
      assigneeId: assigneeId ?? undefined,
    },
    select: { id: true, externalThreadId: true },
  });
  return thread;
}

export async function ingestVenueDaVisitorMessage(
  externalThreadId: string,
  payload: Record<string, unknown>,
) {
  const threadId = nonEmpty(externalThreadId, "threadId", true);
  const thread = await prisma.venueDaThread.findUnique({ where: { externalThreadId: threadId } });
  if (!thread) throw new VenueDaRequestError(404, "상담방을 찾을 수 없습니다.");

  const clientMessageId = nonEmpty(payload.messageId ?? payload.clientMessageId, "messageId", false);
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const attachments = normalizedAttachments(payload.attachments);
  if (!body && (!attachments || attachments.length === 0)) {
    throw new VenueDaRequestError(400, "메시지 내용이나 첨부파일이 필요합니다.");
  }

  if (clientMessageId) {
    const duplicate = await prisma.venueDaMessage.findFirst({
      where: { threadId: thread.id, clientMessageId },
      select: { id: true },
    });
    if (duplicate) return duplicate;
  }

  const message = await prisma.venueDaMessage.create({
    data: {
      threadId: thread.id,
      clientMessageId,
      authorType: "visitor",
      authorId: nonEmpty(payload.authorId, "authorId", false),
      authorName: nonEmpty(payload.authorName, "authorName", false),
      body,
      attachments,
      deliveryStatus: "received",
    },
    select: { id: true },
  });
  await prisma.venueDaThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(), status: "open" } });
  return message;
}

/** 문의 전환 전 사용할 짧은 요약을 저장한다. AI 호출 없이 결정적으로 생성해 비용·지연을 만들지 않는다. */
export async function summarizeVenueDaThread(externalThreadId: string) {
  const thread = await prisma.venueDaThread.findUnique({
    where: { externalThreadId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
  });
  if (!thread) throw new VenueDaRequestError(404, "상담방을 찾을 수 없습니다.");

  const lines = thread.messages
    .filter((message) => message.body.trim())
    .slice(-10)
    .map((message) => `${message.authorType === "admin" ? "관리자" : "방문자"}: ${message.body.trim().slice(0, 240)}`);
  const summary = [`제목: ${thread.subject}`, ...lines].join("\n").slice(0, 4000);
  await prisma.venueDaThread.update({ where: { id: thread.id }, data: { summary } });
  return summary;
}

export function isVenueDaManager(role: string | undefined | null) {
  return role === "admin" || role === "manager";
}

export async function listVenueDaThreadsForUser(userId: string, role?: string | null) {
  const threads = await prisma.venueDaThread.findMany({
    where: isVenueDaManager(role) ? undefined : { assigneeId: userId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { lastMessageAt: "desc" },
  });
  if (threads.length === 0) return [];

  const unreadRows = await prisma.venueDaMessage.groupBy({
    by: ["threadId"],
    where: { threadId: { in: threads.map((thread) => thread.id) }, authorType: "visitor", readAt: null },
    _count: { id: true },
  });
  const unreadMap = new Map(unreadRows.map((row) => [row.threadId, row._count.id]));

  return threads.map((thread) => {
    const latest = thread.messages[0];
    return {
      conversationId: `venueda:${thread.id}`,
      other: {
        id: `venueda:${thread.id}`,
        name: thread.memberEmail || "VenueDA 방문자",
        image: null,
        role: "venueda",
        source: "venueda",
        venueDaThreadId: thread.id,
        subtitle: thread.subject,
      },
      lastMsg: latest
        ? {
            id: latest.id,
            content: latest.body,
            senderId: latest.authorType === "admin" ? latest.authorId ?? "" : `venueda:${thread.id}:visitor`,
            createdAt: latest.createdAt.toISOString(),
            readAt: latest.readAt?.toISOString() ?? null,
            attachmentName: null,
          }
        : null,
      unread: unreadMap.get(thread.id) ?? 0,
    };
  });
}

export async function getVenueDaThreadForUser(threadId: string, userId: string, role?: string | null) {
  const thread = await prisma.venueDaThread.findUnique({ where: { id: threadId } });
  if (!thread) return null;
  if (!isVenueDaManager(role) && thread.assigneeId !== userId) return null;
  return thread;
}

export async function listVenueDaMessages(threadId: string, userId: string, role?: string | null) {
  const thread = await getVenueDaThreadForUser(threadId, userId, role);
  if (!thread) return null;

  // 여러 관리자가 상담을 볼 수 있어도 읽음 기준은 담당자 한 명으로 고정한다.
  // 담당자가 아닌 서브 관리자가 열어 본 것만으로는 담당자 알림을 지우지 않는다.
  if (thread.assigneeId === userId) {
    await prisma.venueDaMessage.updateMany({
      where: { threadId, authorType: "visitor", readAt: null },
      data: { readAt: new Date() },
    });
  }
  const messages = await prisma.venueDaMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" }, take: 200 });
  return messages.map((message) => ({
    id: message.id,
    senderId: message.authorType === "admin" ? message.authorId ?? "" : `venueda:${thread.id}:visitor`,
    content: message.body,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
    attachmentDriveFileId: null,
    attachmentName: null,
    attachmentMimeType: null,
    attachmentSizeBytes: null,
    attachmentUrl: null,
  }));
}

export async function sendVenueDaAdminReply(
  threadId: string,
  userId: string,
  role: string | undefined | null,
  body: string,
  authorName?: string,
) {
  const thread = await getVenueDaThreadForUser(threadId, userId, role);
  if (!thread) throw new VenueDaRequestError(403, "이 상담에 답변할 권한이 없습니다.");
  const text = body.trim();
  if (!text) throw new VenueDaRequestError(400, "내용을 입력해주세요.");

  const messageId = randomUUID();
  const message = await prisma.venueDaMessage.create({
    data: { threadId, authorType: "admin", authorId: userId, authorName, body: text, deliveryStatus: "pending" },
    select: { id: true },
  });

  const baseUrl = process.env.VENUEDA_BASE_URL?.replace(/\/$/, "");
  const secret = process.env.VENUEDA_INTEGRATION_SECRET?.trim();
  if (!baseUrl || !secret) {
    await prisma.venueDaMessage.update({ where: { id: message.id }, data: { deliveryStatus: "failed", lastSyncError: "VenueDA 연동 환경변수가 없습니다." } });
    throw new VenueDaRequestError(503, "VenueDA 연동이 설정되지 않았습니다.");
  }

  try {
    const response = await fetch(`${baseUrl}/api/internal/erp/inquiry-threads/${encodeURIComponent(thread.externalThreadId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ messageId, authorId: userId, authorName: authorName ?? "관리자", body: text, attachments: [] }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`VenueDA 응답 ${response.status}`);
    await prisma.$transaction([
      prisma.venueDaMessage.update({ where: { id: message.id }, data: { deliveryStatus: "sent" } }),
      prisma.venueDaThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(), lastSyncError: null } }),
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : "알 수 없는 오류";
    await prisma.venueDaMessage.update({ where: { id: message.id }, data: { deliveryStatus: "failed", lastSyncError: reason } });
    throw new VenueDaRequestError(502, "VenueDA로 답변을 전달하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}
