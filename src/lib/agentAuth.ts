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

export const BRIDGE_AGENT_TYPES = ["hermes", "marketer"] as const;
export type BridgeAgentType = (typeof BRIDGE_AGENT_TYPES)[number];

/**
 * DB 조회 전에 자격증명 없는 요청을 걸러내기 위한 사전 검사.
 *
 * 일부 라우트는 대상 레코드의 agentType 을 알아야 키를 검증할 수 있어서 조회가 먼저
 * 필요했는데, 그러면 인증 없는 요청이 DB 쿼리를 유발한다(무료 플랜 컴퓨트 소진 경로).
 *
 * **이 함수만으로는 agentType 별 권한을 보장하지 않는다.** 레코드를 읽은 뒤 반드시
 * verifyBridgeApiKey(req, record.agentType) 로 다시 확인할 것.
 */
export function hasAnyBridgeCredential(req: NextRequest): boolean {
  return BRIDGE_AGENT_TYPES.some((agentType) => verifyBridgeApiKey(req, agentType));
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
