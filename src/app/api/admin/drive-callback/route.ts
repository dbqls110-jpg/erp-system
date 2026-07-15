import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { encryptForStorage } from "@/lib/googleClient";

const CALLBACK_URL = "https://erp-system-lojo.onrender.com/api/admin/drive-callback";

// 토큰을 DB에 암호화 저장 후 관리자가 /api/admin/get-drive-token으로 1회 조회
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `Google 인증 거부: ${error}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "code 파라미터 없음" }, { status: 400 });
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    CALLBACK_URL,
  );

  try {
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.json({
        error: "refresh_token이 없습니다.",
        action: "Google 계정 설정 → 서드파티 앱에서 이 ERP 앱 권한 제거 후 /api/admin/drive-setup 재방문",
      }, { status: 400 });
    }

    // 토큰을 암호화 후 AgentAuditLog에 10분 유효 임시 저장 (응답·로그에 원문 미노출)
    const encrypted = encryptForStorage(tokens.refresh_token);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await prisma.agentAuditLog.create({
      data: {
        method: "GET",
        endpoint: "/api/admin/drive-callback",
        action: "drive_token_pending",
        dryRun: false,
        payload: { expiresAt },
        result: { enc: encrypted },
      },
    });

    return NextResponse.json({
      ok: true,
      message: "인증 성공. 10분 내에 GET /api/admin/get-drive-token (admin 세션 필요)을 호출해 토큰을 조회하세요.",
      scope: tokens.scope,
      expiresAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "토큰 교환 실패", detail: msg }, { status: 500 });
  }
}
