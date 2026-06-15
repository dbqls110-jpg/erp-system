import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { getHermesUser } from "@/lib/agentApi";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";
import { dispatchHermesWebhook } from "@/lib/hermesWebhook";

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
  const webhookPayload = { userId: hermesUser.id, date: today, clockIn: now.toISOString() };

  if (dryRun) {
    await auditLog({ method: "POST", endpoint: "/api/agent/attendance/check-in", action: "clock_in", dryRun: true, payload: webhookPayload });
    return NextResponse.json({ dryRun: true, preview: webhookPayload, message: "dryRun=true: 실제 저장되지 않았습니다." });
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

  await auditLog({ method: "POST", endpoint: "/api/agent/attendance/check-in", action: "clock_in", dryRun: false, payload: webhookPayload, result: { id: attendance.id } });

  // 출근 저장 성공 후 webhook 발송 (fire-and-forget)
  void dispatchHermesWebhook({
    eventId: `attendance-checkin-${attendance.id}`,
    event: "erp.attendance.checked_in",
    userId: hermesUser.id,
    userName: hermesUser.name ?? null,
    userEmail: hermesUser.email,
    attendanceId: attendance.id,
    clockIn: attendance.clockIn ? new Date(attendance.clockIn).toISOString() : now.toISOString(),
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ attendance }, { status: 201 });
}
