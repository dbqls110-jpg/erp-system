import {
  isExternal,
  projectWhereFor,
  type Viewer,
} from "@/lib/calendarVisibility";

/** 외부 프로젝트 조회는 허용 목록으로 제한한다. 내부 필드를 읽은 뒤 숨기지 않는다. */
export const EXTERNAL_PROJECT_SELECT = {
  id: true, name: true, status: true, progress: true, deadline: true, announceDate: true,
} as const;

export type ExternalProject = {
  id: string; name: string; status: string; progress: number;
  deadline: string | null; announceDate: string | null;
};

/** ORM 결과가 바뀌거나 과도한 fixture가 주입돼도 외부 DTO에는 허용 필드만 남긴다. */
export function externalProjectDto(project: ExternalProject): ExternalProject {
  return {
    id: project.id, name: project.name, status: project.status, progress: project.progress,
    deadline: project.deadline, announceDate: project.announceDate,
  };
}

/**
 * 프로젝트를 외부 계정에 보여 줄 수 있는 연결 범위가 있는지 판정한다.
 *
 * 공간 호스트(venueId)만 연결된 계정은 공간 자료만 다루므로 프로젝트 메뉴를
 * 열지 않는다. 파트너 또는 거래처가 연결된 계정만 해당 연결 테이블의
 * 프로젝트를 읽을 수 있다.
 */
export function hasLinkedProjectScope(viewer: Viewer | null | undefined): boolean {
  return Boolean(viewer?.partnerId || viewer?.customerId);
}

/** 외부 계정이 프로젝트 메뉴를 볼 수 있는지 판정한다. */
export function canViewLinkedProjects(viewer: Viewer | null | undefined): boolean {
  return hasLinkedProjectScope(viewer);
}

/**
 * 프로젝트 조회에 붙일 가시성 조건.
 * 내부 사용자는 기존 전체 프로젝트 범위를 유지하고, 연결된 외부 사용자는
 * partnerId/customerId로 연결된 프로젝트만 읽는다.
 */
export function projectWhereForViewer(viewer: Viewer | null | undefined) {
  if (!viewer) return {};
  if (!hasLinkedProjectScope(viewer)) {
    // role=partner/host 또는 venueId만 있는 외부 계정은 연결 프로젝트가 없으므로
    // 관리자 권한 설정이 실수로 열려도 전체 프로젝트가 새지 않게 막는다.
    return isExternal(viewer) ? { id: { in: [] as string[] } } : {};
  }
  return projectWhereFor(viewer);
}

/** 서버에서 계산한 메뉴 집합에 외부 프로젝트 읽기 권한을 추가한다. */
export function withLinkedProjectMenu(
  menus: ReadonlySet<string>,
  viewer: Viewer | null | undefined,
): Set<string> {
  const result = new Set(menus);
  if (canViewLinkedProjects(viewer)) result.add("projects");
  return result;
}
