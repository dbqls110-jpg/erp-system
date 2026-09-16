/**
 * 제안 카드 상태 복원 — 비서를 다시 열어도 적용한 제안이 다시 묻지 않게
 */
import { describe, it, expect } from "vitest";
import { restoreProposalStates, PROPOSAL_CANCEL_ACTION } from "@/lib/proposalStates";

const t = (s: number) => new Date(2026, 8, 16, 10, 0, s);

describe("restoreProposalStates", () => {
  it("적용 로그가 있으면 done, 취소 로그면 cancelled", () => {
    const m = restoreProposalStates(["j1"], [
      { action: "assistant_apply_inquiry_move", payload: { jobId: "j1", index: 0 }, createdAt: t(1) },
      { action: PROPOSAL_CANCEL_ACTION, payload: { jobId: "j1", index: 1 }, createdAt: t(2) },
    ]);
    expect(m.get("j1")).toEqual([
      { index: 0, state: "done" },
      { index: 1, state: "cancelled" },
    ]);
  });
  it("같은 자리에 기록이 여러 개면 가장 최근 것", () => {
    const m = restoreProposalStates(["j1"], [
      { action: "assistant_apply_inquiry_move", payload: { jobId: "j1", index: 0 }, createdAt: t(5) },
      { action: PROPOSAL_CANCEL_ACTION, payload: { jobId: "j1", index: 0 }, createdAt: t(1) },
    ]);
    expect(m.get("j1")).toEqual([{ index: 0, state: "done" }]);
  });
  it("목록에 없는 job 과 모양이 다른 payload 는 무시", () => {
    const m = restoreProposalStates(["j1"], [
      { action: "assistant_apply_x", payload: { jobId: "other", index: 0 }, createdAt: t(1) },
      { action: "assistant_apply_x", payload: { title: "no ids" }, createdAt: t(1) },
      { action: "assistant_apply_x", payload: null, createdAt: t(1) },
    ]);
    expect(m.size).toBe(0);
  });
});
