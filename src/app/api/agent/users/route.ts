import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const page = Math.max(parseInt(searchParams.get("page") ?? "1"), 1);

  const where: Record<string, unknown> = { active: true };
  if (q) where.OR = [
    { name: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
  ];

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  return NextResponse.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
}
