/**
 * AI 비서에 붙이는 자료는 질문자가 볼 수 있는 메뉴로 제한된다.
 */
import { describe, it, expect } from "vitest";
import { detectTopics, filterTopicsByMenus } from "@/lib/agentContext";

describe("filterTopicsByMenus", () => {
  it("파트너(메신저·캘린더만)는 프로젝트·거래처 자료를 못 받는다", () => {
    const topics = detectTopics("진행 중인 프로젝트랑 거래처 목록 알려줘");
    expect(topics).toEqual(expect.arrayContaining(["projects", "customers"]));
    const { allowed, blocked } = filterTopicsByMenus(topics, new Set(["messenger", "calendar"]));
    expect(allowed).not.toContain("projects");
    expect(allowed).not.toContain("customers");
    expect(blocked).toEqual(expect.arrayContaining(["projects", "customers"]));
  });
  it("메뉴가 열려 있으면 그대로 통과", () => {
    const { allowed, blocked } = filterTopicsByMenus(["projects", "venues"], new Set(["projects", "venues"]));
    expect(allowed).toEqual(["projects", "venues"]);
    expect(blocked).toEqual([]);
  });
});
