import { prisma } from "@/lib/prisma";

export const HERMES_AGENT_EMAIL = process.env.HERMES_AGENT_EMAIL ?? "ybsw1220@gmail.com";
export const MARKETER_AGENT_EMAIL = process.env.MARKETER_AGENT_EMAIL ?? "marketer-agent@local.erp";

export async function getAgentUser(agentType: string) {
  const byType = await prisma.user.findFirst({
    where: { agentType, isAgent: true, active: true },
  });
  if (byType) return byType;
  // email fallback for known agent types
  const fallbackEmail = agentType === "marketer" ? MARKETER_AGENT_EMAIL : HERMES_AGENT_EMAIL;
  return prisma.user.findUnique({ where: { email: fallbackEmail } });
}

// 하위 호환 wrapper
export async function getHermesUser() {
  return getAgentUser("hermes");
}

export async function getOrCreateConversation(userIdA: string, userIdB: string) {
  const [a, b] = [userIdA, userIdB].sort();
  return prisma.conversation.upsert({
    where: { participantA_participantB: { participantA: a, participantB: b } },
    create: { participantA: a, participantB: b },
    update: {},
  });
}
