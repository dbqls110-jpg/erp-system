import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const page = Math.max(parseInt(searchParams.get("page") ?? "1"), 1);

  const validStatuses = ["pending", "approved", "rejected"];
  const where = status && validStatuses.includes(status) ? { status } : undefined;

  const [total, leaves] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, isAgent: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  return NextResponse.json({ leaves, total, page, limit, totalPages: Math.ceil(total / limit) });
}
