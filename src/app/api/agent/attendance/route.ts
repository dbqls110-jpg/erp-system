import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date"); // YYYY-MM-DD, 없으면 오늘

  const targetDate = date ?? new Date().toISOString().split("T")[0];

  const records = await prisma.attendance.findMany({
    where: { date: targetDate },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { clockIn: "asc" },
  });

  return NextResponse.json({ date: targetDate, attendance: records });
}
