import { describe, expect, it } from "vitest";
import { getDisplayedProjectProgress } from "@/lib/projectProgress";

describe("프로젝트 완료 진행률", () => {
  it("완료 상태는 저장된 값과 상관없이 100%로 표시한다", () => {
    expect(getDisplayedProjectProgress("completed", 0)).toBe(100);
    expect(getDisplayedProjectProgress("completed", 45)).toBe(100);
  });

  it("진행 중과 보류 상태는 실제 진행률을 유지한다", () => {
    expect(getDisplayedProjectProgress("active", 0)).toBe(0);
    expect(getDisplayedProjectProgress("active", 50)).toBe(50);
    expect(getDisplayedProjectProgress("on_hold", 25)).toBe(25);
  });
});
