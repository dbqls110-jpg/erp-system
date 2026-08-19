import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const role = req.nextauth?.token?.role as string | undefined;
    const { pathname } = req.nextUrl;

    if (role === "pending" && !pathname.startsWith("/pending")) {
      return NextResponse.redirect(new URL("/pending", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  // api/health 는 외부 업타임 모니터와 keepalive 가 인증 없이 호출해야 하므로 제외한다.
  // (제외 전에는 세션이 없으면 /login 으로 307 리다이렉트되어 헬스체크로 쓸 수 없었다)
  matcher: ["/((?!api/auth|api/agent|api/health|_next/static|_next/image|favicon.ico|public/).*)"],
};
