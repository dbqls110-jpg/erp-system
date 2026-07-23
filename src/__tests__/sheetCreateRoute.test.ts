import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  verifyAgentApiKey,
  verifyBridgeApiKey,
  auditLog,
} = vi.hoisted(() => ({
  verifyAgentApiKey: vi.fn(),
  verifyBridgeApiKey: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("@/lib/agentAuth", () => ({
  verifyAgentApiKey,
  verifyBridgeApiKey,
}));

vi.mock("@/lib/agentAudit", () => ({
  auditLog,
}));

import { POST } from "@/app/api/agent/sheets/create/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/agent/sheets/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/sheets/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAgentApiKey.mockReturnValue(false);
    verifyBridgeApiKey.mockReturnValue(false);
    auditLog.mockResolvedValue(undefined);
  });

  it("accepts the matching bridge key for a dry run", async () => {
    verifyBridgeApiKey.mockReturnValue(true);

    const response = await POST(makeRequest({
      agentType: "hermes",
      title: "테스트 시트",
      tabs: ["현황"],
      dryRun: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.preview.title).toBe("테스트 시트");
    expect(verifyBridgeApiKey).toHaveBeenCalledWith(expect.anything(), "hermes");
    expect(auditLog).toHaveBeenCalledOnce();
  });

  it("rejects a bridge key that does not match agentType", async () => {
    const response = await POST(makeRequest({
      agentType: "marketer",
      title: "테스트 시트",
      dryRun: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("UNAUTHORIZED");
  });

  it("rejects unknown agent types with a stable error code", async () => {
    const response = await POST(makeRequest({
      agentType: "unknown",
      title: "테스트 시트",
      dryRun: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("INVALID_AGENT_TYPE");
    expect(verifyBridgeApiKey).not.toHaveBeenCalled();
  });
});
