import { describe, expect, it } from "vitest";
import {
  parseProposals,
  validateProposal,
  fieldLabel,
  type Proposal,
} from "@/lib/assistantProposal";

function fence(json: string) {
  return "```erp-update\n" + json + "\n```";
}

const VALID = JSON.stringify({
  target: "venue",
  id: "venue-1",
  label: "구로구민회관 대공연장",
  changes: { calledAt: "2026-08-26", calledPrice: 700000, calledNote: "11/27 가능" },
  reason: "통화로 확인",
});

describe("parseProposals — 답변에서 제안 뽑기", () => {
  it("제안 블록을 읽는다", () => {
    const [p] = parseProposals("전화하신 내용을 이렇게 기록할까요?\n" + fence(VALID));
    expect(p.target).toBe("venue");
    expect(p.id).toBe("venue-1");
    expect(p.changes.calledPrice).toBe(700000);
  });

  it("제안이 없는 평범한 답변에서는 아무것도 나오지 않는다", () => {
    expect(parseProposals("구로구민회관 전화번호는 02-860-3114 입니다.")).toEqual([]);
  });

  it("JSON 이 깨지면 제안으로 다루지 않는다", () => {
    // 답변이 잘려 도착하는 일이 실제로 생긴다. 그때 반쪽짜리 값을 저장하면 안 된다.
    expect(parseProposals(fence('{"target":"venue","id":'))).toEqual([]);
  });

  it("모르는 대상은 버린다", () => {
    expect(parseProposals(fence('{"target":"users","id":"u1","changes":{"role":"admin"}}'))).toEqual([]);
  });

  it("id 가 없으면 버린다", () => {
    // id 없이 적용하면 어느 행을 고칠지 알 수 없다.
    expect(parseProposals(fence('{"target":"venue","changes":{"calledNote":"x"}}'))).toEqual([]);
  });

  it("제안이 여러 개면 모두 읽는다 (정규식 lastIndex 초기화)", () => {
    const two = fence(VALID) + "\n" + fence(VALID);
    expect(parseProposals(two)).toHaveLength(2);
    expect(parseProposals(two)).toHaveLength(2);
  });
});

describe("validateProposal — 무엇을 받아들이고 무엇을 버리는가", () => {
  const make = (changes: Record<string, unknown>, target = "venue"): Proposal =>
    ({ target, id: "x", changes } as Proposal);

  it("허용된 칸만 받는다", () => {
    const { accepted, rejected } = validateProposal(
      make({ calledNote: "메모", price: 1, capacityMax: 999 }),
    );
    expect(Object.keys(accepted)).toEqual(["calledNote"]);
    // 원본 요금과 정원은 공간 DB 를 다시 적재하면 덮어써진다. 여기서 고치게 두면
    // 고쳤다고 믿게 만들어 더 나쁘다.
    expect(rejected.map((r) => r.field).sort()).toEqual(["capacityMax", "price"]);
  });

  it("날짜는 형식을 지킨 것만 받는다", () => {
    expect(validateProposal(make({ calledAt: "2026-08-26" })).rejected).toEqual([]);
    // "내일" 을 Date 로 바로 넘기면 Invalid Date 가 조용히 저장된다.
    expect(validateProposal(make({ calledAt: "내일" })).rejected).toHaveLength(1);
    expect(validateProposal(make({ calledAt: "2026/08/26" })).rejected).toHaveLength(1);
  });

  it("금액에서 단위를 떼어 숫자로 만든다", () => {
    const { accepted } = validateProposal(make({ calledPrice: "700,000원" }));
    expect(accepted.calledPrice).toBe(700000);
  });

  it("음수 금액은 버린다", () => {
    expect(validateProposal(make({ calledPrice: -1 })).rejected).toHaveLength(1);
  });

  it("진행률이 100을 넘으면 버린다", () => {
    const { rejected } = validateProposal(make({ progress: 150 }, "project"));
    expect(rejected).toHaveLength(1);
  });

  it("null 은 값을 지우라는 뜻으로 받는다", () => {
    const { accepted, rejected } = validateProposal(make({ calledNote: null }));
    expect(accepted.calledNote).toBeNull();
    expect(rejected).toEqual([]);
  });

  it("지나치게 긴 글은 버린다", () => {
    // 막지 않으면 AI 가 답변을 통째로 메모에 밀어 넣는 일이 생긴다.
    const { rejected } = validateProposal(make({ calledNote: "가".repeat(501) }));
    expect(rejected).toHaveLength(1);
  });

  it("대상마다 허용 칸이 다르다", () => {
    // 공간의 통화 기록 칸을 파트너에 쓰려 하면 통하지 않아야 한다.
    expect(validateProposal(make({ calledPrice: 1 }, "partner")).rejected).toHaveLength(1);
    expect(validateProposal(make({ phone: "010-0000-0000" }, "partner")).rejected).toEqual([]);
  });
});

describe("fieldLabel", () => {
  it("화면에 보일 한국어 이름을 준다", () => {
    expect(fieldLabel("venue", "calledPrice")).toBe("확인 요금");
    expect(fieldLabel("project", "deadline")).toBe("마감일");
  });

  it("모르는 칸은 원래 이름을 그대로 준다", () => {
    expect(fieldLabel("venue", "unknown")).toBe("unknown");
  });
});
