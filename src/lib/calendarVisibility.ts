/**
 * 캘린더에서 누가 무엇을 볼 수 있는지 정한다.
 *
 * 파트너(개인 프리랜서)와 거래처(회사 담당자)도 로그인해서 캘린더를 본다. 다만
 * 자기가 참여한 프로젝트의 일정만 봐야 한다. 여기서 잘못 열면 남의 행사 일정과
 * 내부 회의가 외부인에게 그대로 노출된다.
 *
 * 판정 규칙을 한 곳에 모아 둔 것은 화면과 API 가 각자 조건을 짜면 한쪽만 고치는 일이
 * 반드시 생기기 때문이다. 조건을 쓰는 곳은 모두 이 함수를 거친다.
 */

export interface Viewer {
  id: string;
  role: string | null | undefined;
  /** 이 계정이 어느 파트너인지. 내부 직원이면 null. */
  partnerId: string | null;
  /** 이 계정이 어느 거래처인지. 내부 직원이면 null. */
  customerId: string | null;
}

/**
 * 외부 사용자인지.
 *
 * role 로 판단하지 않는다. role=partner 는 "권한이 낮다"는 뜻일 뿐이고, 실제로
 * 어느 파트너인지는 partnerId 가 말해 준다. 반대로 관리자가 실수로 role 을
 * 높게 줬더라도 partnerId 가 붙어 있으면 외부인이다 — 연결이 곧 신분이다.
 */
export function isExternal(viewer: Viewer): boolean {
  return viewer.partnerId !== null || viewer.customerId !== null;
}

/**
 * Prisma where 절. 이 사람이 볼 수 있는 일정만 남긴다.
 *
 * 내부 직원에게는 조건을 걸지 않는다(전부 보임).
 * 외부 사용자에게는 "내가 연결된 프로젝트의 일정" 만 남긴다. projectId 가 비어 있는
 * 일정은 내부 일정이므로 제외된다 — 실수로 비워 둔 일정이 새는 것보다 안 보이는 편이 낫다.
 */
export function calendarWhereFor(viewer: Viewer) {
  if (!isExternal(viewer)) return {};

  const links = [];
  if (viewer.partnerId) {
    links.push({ partners: { some: { partnerId: viewer.partnerId } } });
  }
  if (viewer.customerId) {
    links.push({ customers: { some: { customerId: viewer.customerId } } });
  }

  // 연결이 하나도 없으면(있을 수 없지만) 아무것도 보이지 않아야 한다.
  if (links.length === 0) return { id: { in: [] as string[] } };

  return { project: { is: { OR: links } } };
}

/**
 * 프로젝트 목록에 걸 조건.
 *
 * 캘린더에는 프로젝트 마감일도 표시된다. 일정만 가리고 프로젝트를 그대로 두면
 * 남의 행사 이름과 마감일이 외부인에게 보인다.
 */
export function projectWhereFor(viewer: Viewer) {
  if (!isExternal(viewer)) return {};

  const links = [];
  if (viewer.partnerId) links.push({ partners: { some: { partnerId: viewer.partnerId } } });
  if (viewer.customerId) links.push({ customers: { some: { customerId: viewer.customerId } } });
  if (links.length === 0) return { id: { in: [] as string[] } };

  return { OR: links };
}

/**
 * 직원 휴가를 보여줄지.
 *
 * 외부인에게는 보이지 않는다. 누가 언제 쉬는지는 회사 안의 일이고, 애초에
 * 파트너가 알아야 할 이유가 없다.
 */
export function showLeaves(viewer: Viewer): boolean {
  return !isExternal(viewer);
}

/**
 * 노션 일정을 보여줄지.
 *
 * 노션 쪽은 우리가 무엇이 적혀 있는지 통제하지 못한다. 프로젝트와 연결되지도
 * 않아 어느 것이 누구 것인지 가릴 방법이 없다. 외부인에게는 통째로 감춘다.
 */
export function showNotionEvents(viewer: Viewer): boolean {
  return !isExternal(viewer);
}

/**
 * 이 사람이 일정을 만들거나 고칠 수 있는지.
 *
 * 외부 사용자는 언제나 읽기만 한다. 자기 프로젝트라도 일정을 바꾸게 두면 우리 쪽
 * 기록이 밖에서 바뀐다. 무엇을 바꿔 달라는 말은 메신저로 받는 편이 맞다.
 */
export function canEditCalendar(viewer: Viewer): boolean {
  return !isExternal(viewer);
}

/**
 * 외부 사용자에게 보일 일정에서 감출 것을 지운다.
 *
 * where 로 걸러도 남은 일정 안에 내부 사정이 적혀 있을 수 있다. 만든 사람이 누구인지,
 * 노션 페이지가 무엇인지는 밖에서 알 필요가 없다.
 */
export function sanitizeEventFor<
  T extends { createdBy?: string; notionPageId?: string | null },
>(viewer: Viewer, event: T): T {
  if (!isExternal(viewer)) return event;
  // 구조분해로 빼내고 나머지만 돌려준다. 뽑아낸 두 값은 쓰지 않는 것이 목적이다.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { createdBy, notionPageId, ...rest } = event;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return rest as T;
}
