import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { getHermesUser } from "@/lib/agentApi";
import { prisma } from "@/lib/prisma";

// GET /api/agent/attendance/logs?limit=30&offset=0
// Hermes Agent 근태 기록 목록 (최신순)
export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hermesUser = await getHermesUser();
  if (!hermesUser) {
    return NextResponse.json({ error: "Hermes Agent 계정을 찾을 수 없습니다." }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

  const [total, records] = await Promise.all([
    prisma.attendance.count({ where: { userId: hermesUser.id } }),
    prisma.attendance.findMany({
      where: { userId: hermesUser.id },
      orderBy: { date: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return NextResponse.json({
    agent: { id: hermesUser.id, name: hermesUser.name },
    records,
    total,
    limit,
    offset,
  });
}
