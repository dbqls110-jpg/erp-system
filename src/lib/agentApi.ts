import { prisma } from "@/lib/prisma";

// HERMES_AGENT_EMAIL 환경변수로 재정의 가능 (기본값: ybsw1220@gmail.com)
export const HERMES_AGENT_EMAIL = process.env.HERMES_AGENT_EMAIL ?? "ybsw1220@gmail.com";

export async function getHermesUser() {
  // isAgent=true 레코드를 우선 사용, 없으면 이메일로 fallback
  const byFlag = await prisma.user.findFirst({ where: { isAgent: true, active: true } });
  if (byFlag) return byFlag;
  return prisma.user.findUnique({ where: { email: HERMES_AGENT_EMAIL } });
}

export async function getOrCreateConversation(userIdA: string, userIdB: string) {
  const [a, b] = [userIdA, userIdB].sort();
  return prisma.conversation.upsert({
    where: { participantA_participantB: { participantA: a, participantB: b } },
    create: { participantA: a, participantB: b },
    update: {},
  });
}
