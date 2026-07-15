import { NextResponse } from "next/server";

// 이 엔드포인트는 보안상 제거됐습니다.
// Drive refresh_token은 OAuth callback에서 암호화되어 DB에 저장되며,
// 서버가 자동으로 읽어 사용합니다. 토큰 원문 조회 기능은 제공하지 않습니다.
// Drive 재인증: GET /api/admin/drive-setup → Google OAuth → 자동 저장
// Drive 상태 확인: GET /api/admin/google-status
export async function GET() {
  return NextResponse.json(
    {
      error: "이 엔드포인트는 제거됐습니다.",
      reason: "보안 정책: refresh_token 원문을 API 응답으로 노출하지 않습니다.",
      alternatives: {
        status: "GET /api/admin/google-status — Drive 연결 상태 확인",
        reauth: "GET /api/admin/drive-setup — 재인증 URL 발급",
      },
    },
    { status: 410 }
  );
}
