import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

const CALLBACK_URL = "https://erp-system-lojo.onrender.com/api/admin/drive-callback";

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
        error: "refresh_token이 없습니다. drive-setup을 다시 방문해 재인증하세요.",
        hint: "이미 이 앱에 인증된 계정이면 Google 계정 설정에서 앱 권한을 취소 후 재시도하세요.",
      }, { status: 400 });
    }

    // refresh_token을 응답에 직접 노출하지 않음 — 서버 로그에만 출력 (Render 로그에서 복사)
    console.log("[drive-callback] GOOGLE_DRIVE_OWNER_REFRESH_TOKEN=", tokens.refresh_token);
    return NextResponse.json({
      message: "인증 성공. Render 로그에서 GOOGLE_DRIVE_OWNER_REFRESH_TOKEN 값을 복사해 환경변수에 저장하세요.",
      scope: tokens.scope,
      hasRefreshToken: !!tokens.refresh_token,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "토큰 교환 실패", detail: msg }, { status: 500 });
  }
}
