import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { active: true, role: { not: "pending" } },
    select: { id: true, name: true, email: true, role: true, image: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
