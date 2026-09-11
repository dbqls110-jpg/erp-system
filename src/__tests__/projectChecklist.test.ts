import { describe, expect, it } from "vitest";

import { parseProposals, validateProposal, type Proposal } from "@/lib/assistantProposal";

function fence(json: string) {
  return "```erp-update\n" + json + "\n```";
}

function make(items: unknown): Proposal {
  return {
    target: "project_checklist",
    id: "project-1",
    changes: { items },
  } as Proposal;
}

describe("project_checklist 제안", () => {
  it("예시처럼 top-level items를 읽고 1. / 1) / ① 번호를 뗀다", () => {
    const [proposal] = parseProposals(
      fence(JSON.stringify({
        target: "project_checklist",
        id: "project-1",
        label: "이상한계절 관광두레",
        items: ["1. 팝업 홍보 리플렛", "1) 기업 홍보 리플렛", "① X배너"],
      })),
    );

    const { accepted, rejected } = validateProposal(proposal);
    expect(accepted.items).toEqual(["팝업 홍보 리플렛", "기업 홍보 리플렛", "X배너"]);
    expect(rejected).toEqual([]);
  });

  it("빈 항목은 버리고 100자를 넘는 항목은 거부한다", () => {
    const { accepted, rejected } = validateProposal(
      make(["  ", "유효한 업무", "가".repeat(101)]),
    );

    expect(accepted.items).toEqual(["유효한 업무"]);
    expect(rejected).toEqual([
      { field: "items[2]", reason: "업무 이름은 100자 이내여야 합니다." },
    ]);
  });

  it("31개를 넘으면 목록 전체를 거부하고 이유를 남긴다", () => {
    const { accepted, rejected } = validateProposal(
      make(Array.from({ length: 31 }, (_, index) => `업무 ${index + 1}`)),
    );

    expect(accepted).toEqual({});
    expect(rejected).toEqual([
      { field: "items", reason: "업무는 한 번에 최대 30개까지 추가할 수 있습니다." },
    ]);
  });

  it("같은 제안 안에서 중복 업무는 하나만 남긴다", () => {
    const { accepted, rejected } = validateProposal(
      make(["1. X배너 제작", "X배너 제작", "  x 배너   제작  "]),
    );

    expect(accepted.items).toEqual(["X배너 제작"]);
    expect(rejected).toEqual([]);
  });
});
