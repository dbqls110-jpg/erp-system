/**
 * 브릿지 식별자.
 *
 * 예전 이름은 hermes / marketer 였다. 특정 에이전트 인격에 묶인 이름이라
 * 파이프라인을 걷어낸 뒤로는 뜻이 맞지 않았고, "브릿지를 한 대 더 붙인다"는
 * 상황에 이름이 걸림돌이 됐다. 중립적인 번호로 바꾼다.
 *
 * 옛 이름도 계속 받아들인다. 회사 PC 의 bridge.env, Render 환경변수, 그리고
 * 이미 DB 에 쌓인 행이 옛 이름을 쓰고 있어서, 한꺼번에 바꾸지 않으면 그 사이에
 * 브릿지가 죽는다. 별칭을 두면 어느 쪽을 먼저 바꿔도 안전하다.
 */

export const BRIDGE_AGENT_TYPES = ["agent-1", "agent-2"] as const;
export type BridgeAgentType = (typeof BRIDGE_AGENT_TYPES)[number];

/** 옛 이름 → 새 이름. 지우려면 DB·회사 PC·Render 가 모두 새 이름으로 바뀐 뒤에. */
export const LEGACY_AGENT_TYPE_ALIASES: Record<string, BridgeAgentType> = {
  hermes: "agent-1",
  marketer: "agent-2",
};

/** 화면에 보여줄 이름. 사람이 읽는 곳에만 쓴다. */
export const AGENT_TYPE_LABELS: Record<BridgeAgentType, string> = {
  "agent-1": "에이전트 1",
  "agent-2": "에이전트 2",
};

/**
 * 들어온 값을 정식 이름으로 바꾼다. 모르는 값이면 null.
 *
 * 경계(HTTP 요청, DB 조회 인자)에서 한 번만 부르고, 그 뒤로는 정식 이름만 쓴다.
 * 곳곳에서 별칭을 풀면 어디가 옛 이름이고 어디가 새 이름인지 알 수 없게 된다.
 */
export function normalizeAgentType(raw: string | null | undefined): BridgeAgentType | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if ((BRIDGE_AGENT_TYPES as readonly string[]).includes(value)) {
    return value as BridgeAgentType;
  }
  return LEGACY_AGENT_TYPE_ALIASES[value] ?? null;
}

/**
 * 그 브릿지가 쓸 수 있는 agentType 값 전부(정식 + 옛 이름).
 *
 * DB 에는 옛 이름으로 쌓인 행이 남아 있으므로, 작업을 찾을 때는 둘 다 봐야 한다.
 */
export function agentTypeAliases(agentType: BridgeAgentType): string[] {
  const legacy = Object.entries(LEGACY_AGENT_TYPE_ALIASES)
    .filter(([, canonical]) => canonical === agentType)
    .map(([old]) => old);
  return [agentType, ...legacy];
}

/**
 * 브릿지 API 키 환경변수 이름. 새 이름을 먼저 보고 없으면 옛 이름을 본다.
 * Render 환경변수를 나중에 바꿔도 그 사이에 인증이 끊기지 않게 하기 위함이다.
 */
export function bridgeApiKeyEnvNames(agentType: BridgeAgentType): string[] {
  const canonical = agentType.toUpperCase().replace(/-/g, "_") + "_BRIDGE_API_KEY";
  const legacy = Object.entries(LEGACY_AGENT_TYPE_ALIASES)
    .filter(([, mapped]) => mapped === agentType)
    .map(([old]) => `${old.toUpperCase()}_BRIDGE_API_KEY`);
  return [canonical, ...legacy];
}
