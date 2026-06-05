import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { getHermesUser } from "@/lib/agentApi";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";

// POST /api/agent/attendance/check-in
// Hermes Agent 출근 기록 (당일 1회만 허용)
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

  if (existing?.clockIn) {
    return NextResponse.json(
      { error: "이미 오늘 출근 기록이 있습니다.", attendance: existing },
      { status: 409 }
    );
  }

  const now = new Date();
  const payload = { userId: hermesUser.id, date: today, clockIn: now.toISOString() };

  if (dryRun) {
    await auditLog({ method: "POST", endpoint: "/api/agent/attendance/check-in", action: "clock_in", dryRun: true, payload });
    return NextResponse.json({ dryRun: true, preview: payload, message: "dryRun=true: 실제 저장되지 않았습니다." });
  }

  let attendance;
  if (!existing) {
    attendance = await prisma.attendance.create({
      data: { userId: hermesUser.id, date: today, clockIn: now },
    });
  } else {
    attendance = await prisma.attendance.update({
      where: { id: existing.id },
      data: { clockIn: now },
    });
  }

  await auditLog({ method: "POST", endpoint: "/api/agent/attendance/check-in", action: "clock_in", dryRun: false, payload, result: { id: attendance.id } });

  return NextResponse.json({ attendance }, { status: 201 });
}
