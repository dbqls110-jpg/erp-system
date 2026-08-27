/**
 * AI 가 내놓은 변경 제안을 검사하고 실제로 적용한다.
 *
 * AI 는 DB 에 직접 쓰지 않는다. 무엇을 어떻게 바꿀지 제안만 하고, 사람이 화면에서
 * 보고 누를 때 서버가 쓴다. 잘못 알아들은 값이 조용히 저장되는 일이 없어야 한다.
 * "70만원" 을 "700만원" 으로 읽어도 사람이 보고 막을 수 있는 자리가 필요하다.
 *
 * 바꿀 수 있는 칸을 좁게 정해 둔 것도 같은 이유다. AI 가 프롬프트에 실린 자료를
 * 잘못 되읽어 원본 요금이나 정원을 덮어쓰면 되돌릴 방법이 없다. 사람이 전화로
 * 확인한 결과처럼 "새로 알게 된 사실" 만 쓸 수 있게 한다.
 */

/** AI 답변에 실려 오는 제안 블록. */
export const PROPOSAL_FENCE = /```erp-update\s*\r?\n([\s\S]*?)```/g;

/**
 * 바꿀 수 있는 칸 목록.
 *
 * 여기 없는 칸은 제안이 들어와도 버린다. 원본 자료(요금·정원·주소)는 공간 DB 를
 * 다시 적재할 때 덮어써지므로, 여기서 고쳐 봐야 다음 갱신에 사라진다. 그런 값을
 * 고칠 수 있게 두면 고쳤다고 믿게 만들어 더 나쁘다.
 */
export const EDITABLE_FIELDS = {
  venue: {
    calledAt: "통화일",
    calledPrice: "확인 요금",
    calledNote: "통화 메모",
  },
  partner: {
    phone: "연락처",
    contractStatus: "거래 상태",
    memo: "비고",
  },
  project: {
    deadline: "마감일",
    progress: "진행률",
    memo: "비고",
  },
} as const;

export type ProposalTarget = keyof typeof EDITABLE_FIELDS;

export interface Proposal {
  target: ProposalTarget;
  /** 바꿀 대상의 id. AI 가 프롬프트에 실린 자료에서 그대로 가져와야 한다. */
  id: string;
  /** 사람이 확인할 수 있게 AI 가 적어 둔 대상 이름. 검증에 쓰지 않는다. */
  label?: string;
  changes: Record<string, string | number | null>;
  /** 왜 이렇게 바꾸는지. 화면에 그대로 보여준다. */
  reason?: string;
}

export interface ProposalIssue {
  field: string;
  reason: string;
}

export interface ValidatedProposal {
  proposal: Proposal;
  /** 실제로 적용할 값. 검사를 통과한 칸만 남는다. */
  accepted: Record<string, string | number | Date | null>;
  /** 버린 칸과 그 이유. 화면에 보여줘야 사람이 왜 빠졌는지 안다. */
  rejected: ProposalIssue[];
}

function isTarget(value: unknown): value is ProposalTarget {
  return typeof value === "string" && value in EDITABLE_FIELDS;
}

/** 답변에서 제안 블록을 뽑는다. 형태가 안 맞으면 조용히 버린다. */
export function parseProposals(answer: string): Proposal[] {
  const out: Proposal[] = [];
  PROPOSAL_FENCE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PROPOSAL_FENCE.exec(answer)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (typeof parsed !== "object" || parsed === null) continue;
      const p = parsed as Record<string, unknown>;
      if (!isTarget(p.target)) continue;
      if (typeof p.id !== "string" || !p.id) continue;
      if (typeof p.changes !== "object" || p.changes === null) continue;

      out.push({
        target: p.target,
        id: p.id,
        label: typeof p.label === "string" ? p.label : undefined,
        reason: typeof p.reason === "string" ? p.reason : undefined,
        changes: p.changes as Record<string, string | number | null>,
      });
    } catch {
      // 깨진 JSON 은 제안으로 다루지 않는다. 답변 본문에는 그대로 남는다.
    }
  }
  return out;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 제안을 검사한다. 통과한 칸만 남기고 나머지는 이유와 함께 돌려준다.
 *
 * 여기서 통과했다고 바로 쓰지 않는다. 사람이 화면에서 보고 누를 때 쓴다.
 */
export function validateProposal(proposal: Proposal): ValidatedProposal {
  const allowed = EDITABLE_FIELDS[proposal.target] as Record<string, string>;
  const accepted: Record<string, string | number | Date | null> = {};
  const rejected: ProposalIssue[] = [];

  for (const [field, value] of Object.entries(proposal.changes)) {
    if (!(field in allowed)) {
      rejected.push({ field, reason: "이 칸은 비서가 바꿀 수 없습니다." });
      continue;
    }

    if (value === null) {
      accepted[field] = null;
      continue;
    }

    // 날짜 칸은 형식을 지킨 문자열만 받는다. Date 로 바로 파싱하면
    // "내일" 같은 말이 Invalid Date 가 되어 조용히 저장된다.
    if (field === "calledAt" || field === "deadline") {
      if (typeof value !== "string" || !DATE_ONLY.test(value)) {
        rejected.push({ field, reason: "날짜는 2026-08-26 형식이어야 합니다." });
        continue;
      }
      accepted[field] = field === "calledAt" ? new Date(`${value}T00:00:00Z`) : value;
      continue;
    }

    if (field === "calledPrice" || field === "progress") {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        rejected.push({ field, reason: "숫자여야 합니다." });
        continue;
      }
      if (field === "progress" && n > 100) {
        rejected.push({ field, reason: "진행률은 100을 넘을 수 없습니다." });
        continue;
      }
      accepted[field] = Math.round(n);
      continue;
    }

    if (typeof value !== "string") {
      rejected.push({ field, reason: "글자여야 합니다." });
      continue;
    }
    // 길이를 막지 않으면 AI 가 답변을 통째로 메모에 넣는 일이 생긴다.
    if (value.length > 500) {
      rejected.push({ field, reason: "500자를 넘습니다." });
      continue;
    }
    accepted[field] = value.trim();
  }

  return { proposal, accepted, rejected };
}

/** 사람이 읽을 칸 이름. 화면에서 "calledPrice" 대신 "확인 요금" 을 보여준다. */
export function fieldLabel(target: ProposalTarget, field: string): string {
  const allowed = EDITABLE_FIELDS[target] as Record<string, string>;
  return allowed[field] ?? field;
}

/**
 * 답변 본문에서 제안 블록을 뺀다.
 *
 * 제안은 카드로 따로 그린다. 본문에 JSON 이 그대로 남으면 사람은 카드와 같은
 * 내용을 두 번 보게 되고, 그중 하나는 읽을 수 없는 모양이다.
 */
export function stripProposals(answer: string): string {
  // replace 는 전역 정규식의 lastIndex 를 스스로 되돌리지만, 이 상수를 exec 로
  // 쓰는 곳(parseProposals)과 같은 객체라 들어올 때 한 번 맞춰 둔다.
  PROPOSAL_FENCE.lastIndex = 0;
  return answer.replace(PROPOSAL_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();
}
