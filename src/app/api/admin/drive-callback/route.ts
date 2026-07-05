import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const CALLBACK_URL = "https://erp-system-lojo.onrender.com/api/admin/drive-callback";

export async function GET(req: NextRequest) {
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

    return NextResponse.json({
      message: "아래 refresh_token을 Render 환경변수 GOOGLE_DRIVE_OWNER_REFRESH_TOKEN에 저장하세요.",
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "토큰 교환 실패", detail: msg }, { status: 500 });
  }
}
