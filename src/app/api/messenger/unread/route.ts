import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ count: 0 });

  const count = await prisma.message.count({
    where: {
      senderId: { not: session.user.id },
      readAt: null,
      conversation: {
        OR: [{ participantA: session.user.id }, { participantB: session.user.id }],
      },
    },
  });

  return NextResponse.json({ count });
}
