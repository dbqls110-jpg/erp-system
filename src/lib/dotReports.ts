import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { koreanDateKey, formatKoreanTime } from "@/lib/dateFormat";
import { DOT_ACCOUNT_ID, DOT_RECIPIENT_EMAIL } from "@/lib/dotPolicy";
import { DotRequestError, getActiveDotAccount } from "@/lib/dotAuth";

export function parseDotReport(value: unknown, now = new Date()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DotRequestError(400, "JSON 객체가 필요합니다.");
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["runId", "kind", "body"].includes(key))) throw new DotRequestError(400, "수신자나 발신자는 지정할 수 없습니다.");
  if (typeof raw.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(raw.runId)) throw new DotRequestError(400, "runId 형식이 올바르지 않습니다.");
  if (raw.kind !== "daily" && raw.kind !== "audit") throw new DotRequestError(400, "kind는 daily 또는 audit이어야 합니다.");
  if (typeof raw.body !== "string" || !raw.body.trim() || raw.body.length > 12_000) throw new DotRequestError(400, "보고 내용은 1~12000자여야 합니다.");
  const date = koreanDateKey(now);
  if (raw.kind === "daily" && formatKoreanTime(now) < "10:00") throw new DotRequestError(409, "일일 보고는 한국시간 오전 10시 이후 전송할 수 있습니다.");
  const body = raw.body.trim();
  return { runId: raw.runId, kind: raw.kind, date, body,
    reportKey: raw.kind === "daily" ? `daily:${date}` : `audit:${raw.runId}`,
    bodyHash: createHash("sha256").update(body).digest("hex") };
}

/** The only permitted DOT write: one immutable report to a server-fixed recipient. */
export async function sendDotReport(input: ReturnType<typeof parseDotReport>) {
  await getActiveDotAccount();
  const recipient = await prisma.user.findUnique({ where: { email: DOT_RECIPIENT_EMAIL }, select: { id: true, active: true, isAgent: true, role: true } });
  if (!recipient?.active || recipient.isAgent || recipient.role === "pending") throw new DotRequestError(503, "보고 수신 계정을 확인해 주세요.");

  return prisma.$transaction(async (tx) => {
    // Database lock serializes retries and the daily cap across processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('erp-dot-reports'))`;
    const existing = await tx.dotReport.findFirst({ where: { OR: [{ reportKey: input.reportKey }, { runId: input.runId }] } });
    if (existing) {
      if (existing.reportKey !== input.reportKey || existing.bodyHash !== input.bodyHash || existing.recipientId !== recipient.id) throw new DotRequestError(409, "이미 전송한 보고입니다. 기존 보고는 변경할 수 없습니다.");
      return { messageId: existing.messageId, duplicate: true };
    }
    if (await tx.dotReport.count({ where: { date: input.date } }) >= 8) throw new DotRequestError(429, "하루 보고 전송 한도를 초과했습니다.");
    const [participantA, participantB] = [DOT_ACCOUNT_ID, recipient.id].sort();
    const conversation = await tx.conversation.upsert({
      where: { participantA_participantB: { participantA, participantB } },
      create: { participantA, participantB }, update: {},
    });
    const message = await tx.message.create({ data: {
      conversationId: conversation.id, senderId: DOT_ACCOUNT_ID,
      content: `[DOT ${input.kind === "daily" ? "일일 점검" : "ERP 검증"} · ${input.date}]\n${input.body}`,
    } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    await tx.dotReport.create({ data: { id: randomUUID(), reportKey: input.reportKey, runId: input.runId, date: input.date,
      kind: input.kind, bodyHash: input.bodyHash, recipientId: recipient.id, messageId: message.id } });
    return { messageId: message.id, duplicate: false };
  }, { maxWait: 10_000, timeout: 20_000 });
}
