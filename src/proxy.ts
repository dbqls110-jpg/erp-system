import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  // 승인 대기(pending) 판정은 여기서 하지 않는다.
  //
  // 미들웨어는 쿠키 속 JWT 를 그대로 읽는데, 서버 컴포넌트의 getServerSession 은 DB 에서
  // 최신 role 을 다시 읽어도 쿠키를 새로 써 주지 못한다. 그래서 관리자가 승인한 뒤에도
  // 쿠키는 "pending" 인 채로 남고, 미들웨어(→ /pending)와 /pending 페이지(승인됐으니
  // → /dashboard)가 서로 튕겨 ERR_TOO_MANY_REDIRECTS 가 났다.
  // pending 안내는 (app)/layout.tsx 와 /pending 페이지가 같은 getServerSession 기준으로
  // 처리하므로 여기서는 로그인 여부만 본다.
  function middleware() {
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
  // dev-preview 는 개발 중 컴포넌트를 로그인 없이 확인하는 경로다. 페이지 자체가
  // 프로덕션에서 notFound() 를 던지므로 배포본에는 존재하지 않는다.
  matcher: ["/((?!api/auth|api/agent|api/health|api/public/|dev-preview|_next/static|_next/image|favicon.ico|public/).*)"],
};
