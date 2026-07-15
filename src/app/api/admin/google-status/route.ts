import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { makeDriveClientAsOwner, isInvalidGrantError } from "@/lib/googleClient";

// GET /api/admin/google-status
// Drive OAuth 토큰 유효성 및 서비스 계정 상태를 확인한다.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    serviceAccount: { configured: false, status: "unknown" },
    ownerOAuth: { configured: false, status: "unknown" },
  };

  // 서비스 계정 설정 확인 (실제 API 호출 없이)
  const hasServiceAccount = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_B64 ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
  );
  result.serviceAccount = {
    configured: hasServiceAccount,
    status: hasServiceAccount ? "configured" : "missing_env",
  };

  // Owner OAuth 토큰 유효성 — 가벼운 Drive API 호출로 검증
  const hasOwnerToken = !!process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  if (!hasOwnerToken) {
    result.ownerOAuth = {
      configured: false,
      status: "missing_env",
      action: "GOOGLE_DRIVE_OWNER_REFRESH_TOKEN 환경변수가 없습니다. /api/admin/drive-setup으로 인증하세요.",
    };
  } else {
    try {
      const drive = makeDriveClientAsOwner();
      await drive.about.get({ fields: "user(emailAddress)" });
      result.ownerOAuth = { configured: true, status: "ok" };
    } catch (err) {
      if (isInvalidGrantError(err)) {
        result.ownerOAuth = {
          configured: true,
          status: "invalid_grant",
          action: "/api/admin/drive-setup을 방문해 재인증하세요. (앱이 프로덕션으로 게시됐는지 확인)",
        };
      } else {
        const msg = err instanceof Error ? err.message : "unknown";
        result.ownerOAuth = { configured: true, status: "error", detail: msg };
      }
    }
  }

  const allOk =
    (result.serviceAccount as Record<string, unknown>).status === "configured" &&
    (result.ownerOAuth as Record<string, unknown>).status === "ok";

  return NextResponse.json({ ok: allOk, ...result });
}
