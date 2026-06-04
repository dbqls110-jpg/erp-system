import { NextRequest } from "next/server";
import crypto from "crypto";

export function verifyAgentApiKey(req: NextRequest) {
  const expected = process.env.ERP_AGENT_API_KEY;
  if (!expected) return false;

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : "";

  if (!token) return false;

  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);

  if (tokenBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}
