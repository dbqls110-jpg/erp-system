import { describe, expect, it } from "vitest";
import {
  parseProposals,
  stripProposals,
  validateProposal,
  fieldLabel,
  type Proposal,
} from "@/lib/assistantProposal";
import { LIMITS } from "@/lib/sheetLimits";

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

const SHEET_VALID = JSON.stringify({
  target: "sheet_create",
  changes: {
    title: "공간 후보",
    tabs: ["후보"],
    data: { 후보: [["이름", "지역"], ["구민회관", "구로구"]] },
  },
  reason: "대화에서 나온 후보 정리",
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

  it("sheet_create 제안은 시트 내용을 읽는다", () => {
    const [p] = parseProposals(fence(SHEET_VALID));
    expect(p.target).toBe("sheet_create");
    expect(p.changes.title).toBe("공간 후보");
    expect(p.changes.data).toEqual({ 후보: [["이름", "지역"], ["구민회관", "구로구"]] });
  });

  it("sheet_create은 id 없이도 읽어 검증에서 이유를 보여준다", () => {
    const [p] = parseProposals(fence(JSON.stringify({ target: "sheet_create", changes: {} })));
    expect(p.target).toBe("sheet_create");
    expect(validateProposal(p).rejected).toEqual([
      { field: "title", reason: "시트 이름이 필요합니다." },
    ]);
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

  it("기존 project 제안도 그대로 검증한다", () => {
    const { accepted, rejected } = validateProposal(
      make({ deadline: "2026-09-01", progress: 50, memo: "중간 점검" }, "project"),
    );
    expect(accepted.deadline).toBe("2026-09-01");
    expect(accepted.progress).toBe(50);
    expect(rejected).toEqual([]);
  });

  it("sheet_create의 셀 상한을 넘으면 이유를 남긴다", () => {
    const rows = Array.from({ length: LIMITS.MAX_INITIAL_CELLS + 1 }, () => ["후보"]);
    const { rejected } = validateProposal({
      target: "sheet_create",
      id: "",
      changes: { title: "공간 후보", tabs: ["후보"], data: { 후보: rows } },
    });
    expect(rejected.some((issue) => issue.field === "data" && issue.reason.includes("최대"))).toBe(true);
  });

  it("sheet_create의 수식처럼 보이는 셀은 글자로 바꾼다", () => {
    const { accepted, rejected } = validateProposal({
      target: "sheet_create",
      id: "",
      changes: {
        title: "합계 확인",
        tabs: ["Sheet1"],
        data: { Sheet1: [["금액"], ["=SUM(A1)"]] },
      },
    });
    const data = accepted.data as Record<string, string[][]>;
    expect(data.Sheet1[1][0]).toBe("'=SUM(A1)");
    expect(rejected).toEqual([]);
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

describe("stripProposals — 본문에서 제안 블록 빼기", () => {
  it("제안 블록을 지우고 사람이 읽을 말만 남긴다", () => {
    const answer = "구로구민회관에 전화하신 내용을 이렇게 기록할까요?\n\n" + fence(VALID);
    const body = stripProposals(answer);
    expect(body).toBe("구로구민회관에 전화하신 내용을 이렇게 기록할까요?");
    expect(body).not.toContain("erp-update");
    expect(body).not.toContain("calledPrice");
  });

  it("제안이 여러 개여도 전부 지운다", () => {
    expect(stripProposals(fence(VALID) + "\n중간 설명\n" + fence(VALID))).toBe("중간 설명");
  });

  it("제안만 있는 답변은 빈 문자열이 된다", () => {
    // 본문이 비면 말풍선을 아예 그리지 않는다. 빈 회색 상자가 남으면 안 된다.
    expect(stripProposals(fence(VALID))).toBe("");
  });

  it("제안이 없는 답변은 그대로 둔다", () => {
    expect(stripProposals("구로구민회관 전화번호는 02-860-3114 입니다.")).toBe(
      "구로구민회관 전화번호는 02-860-3114 입니다.",
    );
  });

  it("깨진 JSON 블록도 본문에서 지운다", () => {
    // parseProposals 는 카드로 만들지 못한다. 본문에 남기면 사람이 JSON 조각을 본다.
    expect(stripProposals("확인해 주세요\n" + fence('{"target":"venue","id":'))).toBe("확인해 주세요");
  });
});
