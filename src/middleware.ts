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
  matcher: ["/((?!api/auth|api/agent|_next/static|_next/image|favicon.ico|public/).*)"],
};
