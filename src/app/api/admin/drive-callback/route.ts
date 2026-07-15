import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { encryptForStorage, clearDriveTokenCache } from "@/lib/googleClient";

const CALLBACK_URL = "https://erp-system-lojo.onrender.com/api/admin/drive-callback";

// GET /api/admin/drive-callback
// Google OAuth 인증 후 redirect 목적지.
// refresh_token을 암호화해 DB에 영구 저장.
// 토큰 원문은 응답·URL·로그 어디에도 노출하지 않는다.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const code  = req.nextUrl.searchParams.get("code");
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
        action:
          "Google 계정 설정 → 서드파티 앱에서 이 ERP 앱 권한을 제거한 뒤 " +
          "/api/admin/drive-setup을 다시 방문하세요.",
      }, { status: 400 });
    }

    // 1. 이전 토큰 레코드 삭제 (교체)
    await prisma.agentAuditLog.deleteMany({ where: { action: "drive_oauth_active" } });

    // 2. 암호화 후 DB에 영구 저장
    const encrypted = encryptForStorage(tokens.refresh_token);
    await prisma.agentAuditLog.create({
      data: {
        method: "GET",
        endpoint: "/api/admin/drive-callback",
        action: "drive_oauth_active",
        dryRun: false,
        payload: { scope: tokens.scope ?? null },
        result: { enc: encrypted },
      },
    });

    // 3. 인메모리 캐시 초기화 (새 토큰 즉시 반영)
    clearDriveTokenCache();

    // 4. 토큰 원문은 응답에 포함하지 않음
    return NextResponse.json({
      ok: true,
      message:
        "Google Drive 인증 성공. " +
        "서버가 DB에서 자동으로 토큰을 읽습니다. " +
        "환경변수 수동 입력이 불필요합니다.",
      scope: tokens.scope,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "토큰 교환 실패", detail: msg }, { status: 500 });
  }
}
