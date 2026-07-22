import { describe, expect, it } from "vitest";
import {
  buildErpSourceUrl,
  detectAgentContextTopics,
  getKstDateParts,
} from "@/lib/agentJobContext";

describe("agent job context", () => {
  it("detects multiple ERP topics without an LLM call", () => {
    expect(detectAgentContextTopics("내 근태랑 이번 달 휴가 현황 알려줘")).toEqual([
      "attendance",
      "leave",
    ]);
    expect(detectAgentContextTopics("현재 진행 중 프로젝트와 지출을 보여줘")).toEqual([
      "projects",
      "finance",
    ]);
  });

  it("uses Korea time when deriving the business date", () => {
    const result = getKstDateParts(new Date("2026-07-21T16:30:00.000Z"));
    expect(result.date).toBe("2026-07-22");
    expect(result.monthStart).toBe("2026-07-01");
    expect(result.monthEnd).toBe("2026-07-31");
  });

  it("builds a clickable absolute ERP source URL", () => {
    expect(buildErpSourceUrl("https://erp.example.com", "/attendance")).toBe(
      "https://erp.example.com/attendance",
    );
  });
});
