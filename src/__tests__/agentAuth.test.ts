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

describe("verifyBridgeApiKey — Hermes/Marketer 라우팅 분리", () => {
  beforeEach(() => {
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

  it("알 수 없는 agentType은 generic 키로 fallback", () => {
    // agentType=unknown → envKey=undefined → falls back to ERP_AGENT_API_KEY
    expect(verifyBridgeApiKey(mockReq("generic-secret"), "unknown")).toBe(true);
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
