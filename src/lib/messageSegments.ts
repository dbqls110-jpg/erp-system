/**
 * 메신저 메시지 본문을 표 블록과 평문으로 나눈다.
 *
 * 렌더링에서 분리해 둔 이유는 두 가지다. 파싱은 규칙이 까다로워 단위 테스트가 필요한데
 * JSX 와 한 파일에 있으면 테스트가 React 까지 끌고 와야 하고, 표 렌더러가 바뀌어도
 * 파싱 규칙은 그대로여야 하기 때문이다.
 */

export interface ResultColumn {
  key: string;
  label: string;
  /**
   * 우리 DB 에 이 항목 자체가 없을 때 true.
   * 셀이 비어 있는 것(미상)과 구분해야 한다 — 전자는 "전화로 물어봐야 아는 것",
   * 후자는 "이 공간만 값이 빠진 것"이라 사용자의 다음 행동이 다르다.
   */
  missing?: boolean;
  align?: "left" | "right";
}

export interface ResultTablePayload {
  title?: string;
  columns: ResultColumn[];
  rows: Record<string, string | number | null>[];
  /** 표 아래에 붙는 주의사항. 셀 안에 넣으면 표가 읽기 어려워진다. */
  notes?: string[];
}

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "table"; value: ResultTablePayload };

/** 답변에 실려 오는 표는 이 펜스 블록 안에 JSON 으로 들어온다. */
const TABLE_FENCE = /```erp-table\s*\r?\n([\s\S]*?)```/g;

function isPayload(value: unknown): value is ResultTablePayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.columns) && Array.isArray(v.rows);
}

/**
 * 표 블록을 기준으로 본문을 자른다.
 *
 * JSON 이 깨졌거나 형태가 안 맞으면 표로 만들지 않고 원문을 그대로 흘려보낸다.
 * 답변이 잘려 도착하는 일은 실제로 생기는데, 그때 화면이 비거나 터지는 것보다
 * 원문이라도 보이는 편이 낫다.
 */
export function parseMessage(content: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  // g 플래그가 있어 lastIndex 가 호출 사이에 남는다. 매번 초기화하지 않으면
  // 두 번째 호출부터 앞쪽 표를 건너뛴다.
  TABLE_FENCE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TABLE_FENCE.exec(content)) !== null) {
    let payload: ResultTablePayload | null = null;
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (isPayload(parsed)) payload = parsed;
    } catch {
      // 깨진 JSON — 아래 조건에서 걸러져 원문으로 남는다.
    }

    if (!payload) continue;

    if (match.index > cursor) {
      segments.push({ kind: "text", value: content.slice(cursor, match.index) });
    }
    segments.push({ kind: "table", value: payload });
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) {
    segments.push({ kind: "text", value: content.slice(cursor) });
  }
  return segments;
}
