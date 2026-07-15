import { NextRequest } from "next/server";
import crypto from "crypto";

function extractToken(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return bearerToken || req.headers.get("x-api-key") || "";
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// 일반 에이전트 키 (Discord bot, ERP 내부 등)
export function verifyAgentApiKey(req: NextRequest): boolean {
  const expected = process.env.ERP_AGENT_API_KEY;
  if (!expected) return false;
  return safeEqual(extractToken(req), expected);
}

// 브릿지 전용 키 (agentType 별 분리)
// HERMES_BRIDGE_API_KEY  → agentType=hermes 만 허용
// MARKETER_BRIDGE_API_KEY → agentType=marketer 만 허용
export function verifyBridgeApiKey(req: NextRequest, agentType: string): boolean {
  const envKey =
    agentType === "hermes"   ? process.env.HERMES_BRIDGE_API_KEY :
    agentType === "marketer" ? process.env.MARKETER_BRIDGE_API_KEY :
    undefined;

  if (!envKey) {
    // 전용 키 미설정 시 일반 ERP_AGENT_API_KEY 로 fallback (개발 편의)
    return verifyAgentApiKey(req);
  }

  return safeEqual(extractToken(req), envKey);
}
