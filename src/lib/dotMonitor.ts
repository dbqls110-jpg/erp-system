import { prisma } from "@/lib/prisma";
import { koreanDateKey, formatKoreanTime } from "@/lib/dateFormat";
import { DOT_ACCOUNT_ID, DOT_RECIPIENT_EMAIL } from "@/lib/dotPolicy";

/** Independent of DOT's own process and credential. Alerts are immutable, one per day. */
export async function checkDotMissingReport(now = new Date()) {
  const date = koreanDateKey(now);
  const start = process.env.DOT_MONITOR_START_DATE ?? "";
  if (process.env.DOT_MONITOR_ENABLED !== "true" || !/^\d{4}-\d{2}-\d{2}$/.test(start)
    || Number.isNaN(Date.parse(`${start}T00:00:00Z`)) || new Date(`${start}T00:00:00Z`).toISOString().slice(0, 10) !== start || date < start) return { status: "disabled" };
  if (formatKoreanTime(now) < "10:15") return { status: "waiting" };
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('erp-dot-reports'))`;
    if (await tx.dotReport.findFirst({ where: { date, kind: "daily" }, select: { id: true } })) return { status: "received" };
    if (await tx.dotMonitorAlert.findUnique({ where: { date } })) return { status: "already_notified" };
    const recipient = await tx.user.findUnique({ where: { email: DOT_RECIPIENT_EMAIL }, select: { id: true, active: true, isAgent: true } });
    const sender = await tx.user.findUnique({ where: { id: DOT_ACCOUNT_ID }, select: { id: true } });
    if (!recipient?.active || recipient.isAgent || !sender) throw new Error("Monitor account unavailable");
    const [participantA, participantB] = [sender.id, recipient.id].sort();
    const conversation = await tx.conversation.upsert({ where: { participantA_participantB: { participantA, participantB } }, create: { participantA, participantB }, update: {} });
    const message = await tx.message.create({ data: { conversationId: conversation.id, senderId: sender.id,
      content: `[시스템 · DOT 보고 누락 · ${date}]\n한국시간 10:15까지 오늘의 DOT 일일 보고가 수신되지 않았습니다. DOT 일정·전용 인증·ERP 연결 상태를 확인해 주세요. 이 알림은 DOT이 작성한 점검 보고가 아니며, 이후 보고가 도착할 수 있습니다.` } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
    await tx.dotMonitorAlert.create({ data: { date, messageId: message.id } });
    return { status: "notified" };
  }, { maxWait: 10_000, timeout: 20_000 });
}
