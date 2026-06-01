import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/pending"];

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (
    req.auth &&
    (req.auth as { user?: { role?: string } }).user?.role === "pending" &&
    !pathname.startsWith("/pending") &&
    !pathname.startsWith("/api/auth")
  ) {
    return NextResponse.redirect(new URL("/pending", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|public/).*)"],
};
