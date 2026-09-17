/**
 * 제안 카드의 "적용/취소" 상태를 서버 기록에서 되살린다.
 *
 * 카드 상태를 화면 안에만 두면 비서를 다시 열 때마다 이미 적용한 제안이 다시 "적용" 버튼을
 * 단 채 나타난다. 적용은 감사 로그(agent_audit_logs)에 jobId·index 와 함께 남으므로
 * 그것을 읽어 카드 초기 상태를 정한다. 취소도 같은 곳에 남긴다.
 */

export type ProposalState = "done" | "cancelled";

export const PROPOSAL_CANCEL_ACTION = "assistant_proposal_cancelled";
export const APPLY_ENDPOINT = "/api/assistant/apply";

export interface ApplyLogRow {
  action: string;
  payload: unknown;
  createdAt: Date;
}

export interface RestoredProposalState {
  index: number;
  state: ProposalState;
}

const KEY_SEP = "::";

/**
 * 로그 → job 별 {index, state}. 같은 자리에 기록이 여러 개면 가장 최근 것을 쓴다
 * (취소했다가 다시 적용한 경우). 로그 순서에 기대지 않고 시각으로 고른다.
 */
export function restoreProposalStates(
  jobIds: ReadonlyArray<string>,
  logs: ReadonlyArray<ApplyLogRow>,
): Map<string, RestoredProposalState[]> {
  const wanted = new Set(jobIds);
  const latest = new Map<string, { at: number; state: ProposalState }>();
  for (const log of logs) {
    const payload = log.payload as { jobId?: unknown; index?: unknown } | null;
    if (!payload || typeof payload.jobId !== "string" || typeof payload.index !== "number") continue;
    if (!wanted.has(payload.jobId)) continue;
    const key = `${payload.jobId}${KEY_SEP}${payload.index}`;
    const at = log.createdAt.getTime();
    const prev = latest.get(key);
    if (prev && prev.at >= at) continue;
    latest.set(key, { at, state: log.action === PROPOSAL_CANCEL_ACTION ? "cancelled" : "done" });
  }
  const result = new Map<string, RestoredProposalState[]>();
  for (const [key, value] of latest) {
    const sep = key.lastIndexOf(KEY_SEP);
    const jobId = key.slice(0, sep);
    const index = Number(key.slice(sep + KEY_SEP.length));
    const list = result.get(jobId) ?? [];
    list.push({ index, state: value.state });
    result.set(jobId, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.index - b.index);
  return result;
}
