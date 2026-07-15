import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { makeDriveClientAsOwner, isInvalidGrantError, clearDriveTokenCache } from "@/lib/googleClient";
import { prisma } from "@/lib/prisma";

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

  // Owner OAuth 토큰 — env 또는 DB 저장 여부 확인
  const hasEnvToken  = !!process.env.GOOGLE_DRIVE_OWNER_REFRESH_TOKEN;
  const hasDbToken   = !!(await prisma.agentAuditLog.findFirst({
    where: { action: "drive_oauth_active" },
    select: { id: true },
  }));
  const hasAnyToken  = hasEnvToken || hasDbToken;
  const tokenSource  = hasEnvToken ? "env" : hasDbToken ? "db" : "none";

  if (!hasAnyToken) {
    result.ownerOAuth = {
      configured: false,
      status: "not_configured",
      tokenSource,
      action: "/api/admin/drive-setup 방문 후 Google OAuth 인증하세요.",
    };
  } else {
    try {
      // 상태 체크 시 캐시 초기화 후 재검증
      clearDriveTokenCache();
      const drive = await makeDriveClientAsOwner();
      const about = await drive.about.get({ fields: "user(emailAddress)" });
      result.ownerOAuth = {
        configured: true,
        status: "ok",
        tokenSource,
        ownerEmail: about.data.user?.emailAddress ?? null,
      };
    } catch (err) {
      if (isInvalidGrantError(err)) {
        // invalid_grant: 재시도 없이 즉시 재인증 필요로 표시
        clearDriveTokenCache();
        result.ownerOAuth = {
          configured: true,
          status: "invalid_grant",
          tokenSource,
          action: "/api/admin/drive-setup을 방문해 재인증하세요. (앱이 프로덕션으로 게시됐는지 확인)",
        };
      } else {
        const msg = err instanceof Error ? err.message : "unknown";
        result.ownerOAuth = { configured: true, status: "error", tokenSource, detail: msg };
      }
    }
  }

  const allOk =
    (result.serviceAccount as Record<string, unknown>).status === "configured" &&
    (result.ownerOAuth as Record<string, unknown>).status === "ok";

  return NextResponse.json({ ok: allOk, ...result });
}
