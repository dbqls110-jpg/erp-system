import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyDotApiKey } from "@/lib/dotAuth";
import { DOT_ACCOUNT_ID, DOT_ROLE } from "@/lib/dotPolicy";

/** The JWT callback rechecks the account and credential fingerprint on each use. */
export async function getDotBrowserSession() {
  const session = await getServerSession(authOptions);
  return session?.user.id === DOT_ACCOUNT_ID && session.user.role === DOT_ROLE && session.user.active === true
    ? session : null;
}

/** Only the two dedicated DOT endpoints may accept the DOT browser session. */
export async function authorizeDotRequest(request: Request) {
  if (request.headers.has("authorization")) return verifyDotApiKey(request);
  if (!request.headers.get("cookie")) return false;
  if (request.method !== "GET" && request.method !== "HEAD") {
    // An HTTP-only login must not turn a cross-site request into a report write.
    const base = process.env.NEXTAUTH_URL;
    if (!base) return false;
    let expected: string;
    try { expected = new URL(base).origin; } catch { return false; }
    if (request.headers.get("origin") !== expected) return false;
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin") return false;
  }
  return !!(await getDotBrowserSession());
}
