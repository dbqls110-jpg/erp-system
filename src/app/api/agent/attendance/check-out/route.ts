import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { getHermesUser } from "@/lib/agentApi";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";

// POST /api/agent/attendance/check-out
// Hermes Agent 퇴근 기록 (출근 기록이 있어야 하며, 근무 시간 자동 계산)
export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const hermesUser = await getHermesUser();
  if (!hermesUser) {
    return NextResponse.json({ error: "Hermes Agent 계정을 찾을 수 없습니다." }, { status: 500 });
  }

  const today = new Date().toISOString().split("T")[0];
  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId: hermesUser.id, date: today } },
  });

  if (!existing?.clockIn) {
    return NextResponse.json({ error: "오늘 출근 기록이 없습니다. 먼저 check-in을 호출하세요." }, { status: 409 });
  }
  if (existing.clockOut) {
    return NextResponse.json(
      { error: "이미 오늘 퇴근 기록이 있습니다.", attendance: existing },
      { status: 409 }
    );
  }

  const now = new Date();
  const workHours = Math.round(
    ((now.getTime() - new Date(existing.clockIn).getTime()) / 3_600_000) * 10
  ) / 10;

  const payload = { userId: hermesUser.id, date: today, clockOut: now.toISOString(), workHours };

  if (dryRun) {
    await auditLog({ method: "POST", endpoint: "/api/agent/attendance/check-out", action: "clock_out", dryRun: true, payload });
    return NextResponse.json({ dryRun: true, preview: payload, message: "dryRun=true: 실제 저장되지 않았습니다." });
  }

  const attendance = await prisma.attendance.update({
    where: { id: existing.id },
    data: { clockOut: now, workHours },
  });

  await auditLog({ method: "POST", endpoint: "/api/agent/attendance/check-out", action: "clock_out", dryRun: false, payload, result: { id: attendance.id, workHours } });

  return NextResponse.json({ attendance }, { status: 201 });
}
