import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { getHermesUser } from "@/lib/agentApi";
import { prisma } from "@/lib/prisma";

// GET /api/agent/attendance/me?date=YYYY-MM-DD
// Hermes Agent 본인의 근태 상태 조회
export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hermesUser = await getHermesUser();
  if (!hermesUser) {
    return NextResponse.json({ error: "Hermes Agent 계정을 찾을 수 없습니다." }, { status: 500 });
  }

  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  const attendance = await prisma.attendance.findUnique({
    where: { userId_date: { userId: hermesUser.id, date } },
  });

  return NextResponse.json({
    date,
    agent: { id: hermesUser.id, name: hermesUser.name, isAgent: hermesUser.isAgent },
    attendance,
  });
}
