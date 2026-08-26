/**
 * agentAuth 테스트
 * - verifyAgentApiKey: Bearer/x-api-key 인증
 * - verifyBridgeApiKey: Hermes/Marketer 라우팅 분리, 잘못된 키 거부
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyAgentApiKey, verifyBridgeApiKey } from "@/lib/agentAuth";

// NextRequest 대신 web standard Request 기반 duck-type mock 사용
function mockReq(token: string, via: "bearer" | "x-api-key" = "bearer") {
  const headers = new Headers();
  if (via === "bearer") {
    headers.set("authorization", `Bearer ${token}`);
  } else {
    headers.set("x-api-key", token);
  }
  return {
    headers: {
      get: (key: string) => headers.get(key),
    },
  } as never;
}

// ─── verifyAgentApiKey ────────────────────────────────────────────────────────

describe("verifyAgentApiKey", () => {
  beforeEach(() => { process.env.ERP_AGENT_API_KEY = "agent-secret-xyz"; });
  afterEach(() => { delete process.env.ERP_AGENT_API_KEY; });

  it("Bearer 토큰이 맞으면 true", () => {
    expect(verifyAgentApiKey(mockReq("agent-secret-xyz"))).toBe(true);
  });

  it("x-api-key 헤더로도 인증 가능", () => {
    expect(verifyAgentApiKey(mockReq("agent-secret-xyz", "x-api-key"))).toBe(true);
  });

  it("틀린 토큰은 false", () => {
    expect(verifyAgentApiKey(mockReq("wrong-token"))).toBe(false);
  });

  it("빈 토큰은 false", () => {
    expect(verifyAgentApiKey(mockReq(""))).toBe(false);
  });

  it("환경변수가 없으면 false", () => {
    delete process.env.ERP_AGENT_API_KEY;
    expect(verifyAgentApiKey(mockReq("any-token"))).toBe(false);
  });
});

// ─── verifyBridgeApiKey — 라우팅 분리 ────────────────────────────────────────

describe("verifyBridgeApiKey — 브릿지별 라우팅 분리", () => {
  beforeEach(() => {
    // 옛 이름의 환경변수. 새 이름(AGENT_1_/AGENT_2_)이 없을 때 이쪽으로 넘어와야 한다.
    process.env.HERMES_BRIDGE_API_KEY   = "hermes-secret";
    process.env.MARKETER_BRIDGE_API_KEY = "marketer-secret";
    process.env.ERP_AGENT_API_KEY       = "generic-secret";
  });

  afterEach(() => {
    delete process.env.HERMES_BRIDGE_API_KEY;
    delete process.env.MARKETER_BRIDGE_API_KEY;
    delete process.env.ERP_AGENT_API_KEY;
  });

  it("Hermes 키로 hermes 엔드포인트 접근 성공", () => {
    expect(verifyBridgeApiKey(mockReq("hermes-secret"), "hermes")).toBe(true);
  });

  it("Marketer 키로 marketer 엔드포인트 접근 성공", () => {
    expect(verifyBridgeApiKey(mockReq("marketer-secret"), "marketer")).toBe(true);
  });

  it("Hermes 키로 marketer 엔드포인트 접근 거부 (라우팅 분리)", () => {
    expect(verifyBridgeApiKey(mockReq("hermes-secret"), "marketer")).toBe(false);
  });

  it("Marketer 키로 hermes 엔드포인트 접근 거부 (라우팅 분리)", () => {
    expect(verifyBridgeApiKey(mockReq("marketer-secret"), "hermes")).toBe(false);
  });

  it("Generic 키는 어느 에이전트도 접근 불가 (전용 키 우선)", () => {
    expect(verifyBridgeApiKey(mockReq("generic-secret"), "hermes")).toBe(false);
    expect(verifyBridgeApiKey(mockReq("generic-secret"), "marketer")).toBe(false);
  });

  it("알 수 없는 agentType 은 거부한다", () => {
    // 예전에는 여기서 ERP_AGENT_API_KEY 로 넘어가 true 였다. 그러면 아무 문자열이나
    // agentType 으로 넣었을 때 일반 키로 브릿지 API 가 열린다. 일반 키는 Discord 봇
    // 같은 내부 호출용이지 브릿지용이 아니다.
    //
    // 특히 jobs/[id] 는 DB 에 적힌 agentType 으로 검증하므로, 예상 못 한 값이 든 행이
    // 하나라도 있으면 일반 키로 남의 작업을 열 수 있었다.
    expect(verifyBridgeApiKey(mockReq("generic-secret"), "unknown")).toBe(false);
  });

  it("새 이름과 옛 이름을 같은 브릿지로 취급한다", () => {
    // 회사 PC 의 bridge.env 와 Render 환경변수를 한꺼번에 바꿀 수 없으므로
    // 둘 다 받아들여야 그 사이에 인증이 끊기지 않는다.
    expect(verifyBridgeApiKey(mockReq("hermes-secret"), "agent-1")).toBe(true);
    expect(verifyBridgeApiKey(mockReq("marketer-secret"), "agent-2")).toBe(true);
    expect(verifyBridgeApiKey(mockReq("hermes-secret"), "agent-2")).toBe(false);
  });

  it("새 이름 환경변수가 옛 이름보다 우선한다", () => {
    process.env.AGENT_1_BRIDGE_API_KEY = "agent1-secret";
    try {
      expect(verifyBridgeApiKey(mockReq("agent1-secret"), "agent-1")).toBe(true);
      expect(verifyBridgeApiKey(mockReq("hermes-secret"), "agent-1")).toBe(false);
    } finally {
      delete process.env.AGENT_1_BRIDGE_API_KEY;
    }
  });

  it("전용 키가 없으면 generic 키로 fallback", () => {
    delete process.env.HERMES_BRIDGE_API_KEY;
    expect(verifyBridgeApiKey(mockReq("generic-secret"), "hermes")).toBe(true);
  });

  it("빈 토큰은 모든 에이전트에서 거부", () => {
    expect(verifyBridgeApiKey(mockReq(""), "hermes")).toBe(false);
    expect(verifyBridgeApiKey(mockReq(""), "marketer")).toBe(false);
  });
});
