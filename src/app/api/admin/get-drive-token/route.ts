import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptFromStorage } from "@/lib/googleClient";

// GET /api/admin/get-drive-token (admin 세션 필요)
// drive-callback 후 10분 내 1회 호출해 새 refresh_token 조회.
// 조회 후 DB 레코드 삭제. 재시도 불가.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // 최근 drive_token_pending 레코드 조회 (10분 이내)
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const record = await prisma.agentAuditLog.findFirst({
    where: { action: "drive_token_pending", createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return NextResponse.json({
      error: "유효한 토큰이 없습니다. drive-callback이 10분 이상 경과했거나 이미 조회됐습니다.",
      action: "/api/admin/drive-setup을 다시 방문해 재인증하세요.",
    }, { status: 404 });
  }

  const result = record.result as Record<string, string> | null;
  const encrypted = result?.enc;
  if (!encrypted) {
    return NextResponse.json({ error: "저장된 토큰 데이터가 손상됐습니다." }, { status: 500 });
  }

  let refreshToken: string;
  try {
    refreshToken = decryptFromStorage(encrypted);
  } catch {
    return NextResponse.json({ error: "토큰 복호화 실패. NEXTAUTH_SECRET 환경변수를 확인하세요." }, { status: 500 });
  }

  // 조회 후 레코드 삭제 (1회성)
  await prisma.agentAuditLog.delete({ where: { id: record.id } });

  return NextResponse.json({
    ok: true,
    GOOGLE_DRIVE_OWNER_REFRESH_TOKEN: refreshToken,
    instruction: "위 값을 Render 대시보드 → Environment → GOOGLE_DRIVE_OWNER_REFRESH_TOKEN에 붙여넣고 Manual Deploy(Clear build cache & deploy)를 실행하세요.",
    warning: "이 토큰은 1회만 조회 가능합니다. 지금 바로 복사하세요.",
  });
}
