import { NextRequest } from "next/server";
import crypto from "crypto";

export function verifyAgentApiKey(req: NextRequest): boolean {
  const expected = process.env.ERP_AGENT_API_KEY;
  if (!expected) return false;

  // Authorization: Bearer <key> 우선, X-API-Key: <key> fallback
  const auth = req.headers.get("authorization") ?? "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const xApiKey = req.headers.get("x-api-key") ?? "";
  const token = bearerToken || xApiKey;

  if (!token) return false;

  // 길이가 다르면 timingSafeEqual이 throw하므로 미리 체크
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}
