import { prisma } from "@/lib/prisma";

export const HERMES_EMAIL = "ybsw1220@gmail.com";

export async function getHermesUser() {
  return prisma.user.findUnique({ where: { email: HERMES_EMAIL } });
}

export async function getOrCreateConversation(userIdA: string, userIdB: string) {
  const [a, b] = [userIdA, userIdB].sort();
  return prisma.conversation.upsert({
    where: { participantA_participantB: { participantA: a, participantB: b } },
    create: { participantA: a, participantB: b },
    update: {},
  });
}
