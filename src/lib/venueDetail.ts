/**
 * 공간 상세에 무엇을 어떤 순서로 보여줄지 정한다.
 *
 * 원본 CSV 는 열이 150개다. 그중 매칭과 목록에 쓰는 것만 컬럼으로 옮기고 나머지는
 * raw 에 통째로 넣어 두었다. 상세 화면에서는 그 나머지가 오히려 중요하다 —
 * "왜 이 요금인가", "무엇을 확인해야 하나" 가 거기 적혀 있기 때문이다.
 *
 * 다만 59개를 그대로 늘어놓으면 아무도 읽지 않는다. 전화 걸기 전에 실제로 보게
 * 되는 순서로 묶는다: 요금 근거 → 조건 → 시설 → 출처.
 *
 * 순수 상수와 함수만 둔다(prisma 를 import 하지 않는다). 클라이언트 컴포넌트가
 * 그대로 가져다 쓸 수 있어야 하기 때문이다.
 */

export interface DetailField {
  key: string;
  label: string;
}

export interface DetailGroup {
  title: string;
  /** 왜 이 묶음을 보는지. 화면에 작은 글씨로 붙는다. */
  hint?: string;
  fields: DetailField[];
}

/**
 * raw 에서 꺼내 보여줄 칸들.
 *
 * 여기 없는 칸은 상세에서도 감춘다. 탐색시도·첨부파일경로처럼 수집 과정의 흔적은
 * 사장님이 볼 이유가 없다.
 */
export const RAW_GROUPS: DetailGroup[] = [
  {
    title: "요금 근거",
    hint: "이 금액이 어디서 나온 값인지. 전화 걸기 전에 이것부터 본다.",
    fields: [
      { key: "대관료_근거", label: "요금 근거" },
      { key: "대관료_상업근거", label: "상업 요율 근거" },
      { key: "요금계산_근거", label: "계산 근거" },
      { key: "대관료_환산근거", label: "환산 근거" },
      { key: "공간별요금", label: "공간별 요금" },
      { key: "부속사용료", label: "부속 사용료" },
      { key: "할증규칙", label: "할증 규칙" },
      { key: "할증_기타", label: "할증 기타" },
      { key: "검증_요금", label: "요금 검증" },
      { key: "요율_판정", label: "요율 판정" },
    ],
  },
  {
    title: "대관 조건",
    fields: [
      { key: "대관방법", label: "대관 방법" },
      { key: "예약개시규칙", label: "예약 개시" },
      { key: "최소_대관시간", label: "최소 대관 시간" },
      { key: "대관료_조건", label: "요금 조건" },
      { key: "이용가능시간", label: "이용 가능 시간" },
      { key: "휴관일", label: "휴관일" },
      { key: "주말이용", label: "주말 이용" },
      { key: "준비철수_구분", label: "준비·철수" },
      { key: "준비철수_비고", label: "준비·철수 비고" },
      { key: "시간_비고", label: "시간 비고" },
    ],
  },
  {
    title: "수용 인원",
    hint: "정원과 관람석은 다른 값이다. 좌석 배치에 따라 달라진다.",
    fields: [
      { key: "수용_근거", label: "정원 근거" },
      { key: "수용_신뢰도", label: "정원 신뢰도" },
      { key: "좌석/수용/면적", label: "좌석·수용·면적" },
      { key: "관람석_원문", label: "관람석 원문" },
      { key: "공연장_규모", label: "공연장 규모" },
      { key: "수용_면적근거", label: "면적 근거" },
    ],
  },
  {
    title: "시설",
    fields: [
      { key: "장비_비용구분", label: "장비 비용" },
      { key: "장비비고", label: "장비 비고" },
      { key: "근거_설비", label: "설비 근거" },
      { key: "근거_주차", label: "주차 근거" },
      { key: "근거_냉난방", label: "냉난방 근거" },
      { key: "실내외", label: "실내·외" },
      { key: "부속_비고", label: "부속 비고" },
    ],
  },
  {
    title: "출처와 확인",
    hint: "언제 확인한 자료인지. 오래된 값은 다시 물어야 한다.",
    fields: [
      { key: "출처URL", label: "출처" },
      { key: "공간 웹사이트 링크", label: "공간 웹사이트" },
      { key: "근거출처", label: "근거 출처" },
      { key: "운영주체", label: "운영 주체" },
      { key: "최종확인일", label: "최종 확인일" },
      { key: "최초수집일", label: "최초 수집일" },
      { key: "조건_확인일", label: "조건 확인일" },
      { key: "검증_메모", label: "검증 메모" },
      { key: "비고", label: "비고" },
    ],
  },
];

/** raw 에서 실제로 값이 있는 칸만 묶어서 돌려준다. 빈 줄이 늘어선 상세는 읽기 어렵다. */
export function buildDetailGroups(
  raw: Record<string, unknown> | null | undefined,
): Array<{ title: string; hint?: string; rows: Array<{ label: string; value: string }> }> {
  const source = raw ?? {};
  return RAW_GROUPS.map((group) => ({
    title: group.title,
    hint: group.hint,
    rows: group.fields.flatMap((field) => {
      const value = source[field.key];
      if (value === null || value === undefined) return [];
      const text = String(value).trim();
      // "0" 은 값이다. 빈 문자열과 구분해야 한다.
      if (!text || text === "-") return [];
      return [{ label: field.label, value: text }];
    }),
  })).filter((group) => group.rows.length > 0);
}
