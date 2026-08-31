import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { DEFAULT_ACCESS_LEVELS, DEFAULT_MENU_RULES, MENU_KEYS } from "@/lib/menu-keys";
import { resolveMenuAccess, type AccessRow } from "@/lib/menuAccessRules";

export { DEFAULT_ACCESS_LEVELS, DEFAULT_MENU_RULES, MENU_KEYS };

/**
 * 메뉴 권한표를 잠시 들고 있는다.
 *
 * 이 표는 관리자가 저장할 때만 바뀌는데, 화면을 열 때마다 다시 읽으면 매번
 * 미국(us-east-1)까지 왕복한다. 빈 쿼리 하나가 197ms 라 이것만으로 체감이 갈린다.
 *
 * 아래 React cache 와 역할이 다르다. 이쪽은 요청과 요청 사이를 덮고, 그쪽은 한 요청
 * 안에서 여러 번 부르는 것을 덮는다. 둘 다 있어야 한다 — 하나만 두면 나머지 구멍으로
 * 왕복이 그대로 남는다.
 *
 * 오래된 권한이 살아 있으면 안 되므로 관리자가 설정을 저장할 때 즉시 버린다.
 */
const MENU_ACCESS_TTL_MS = 60_000;
let menuAccessCache: { at: number; rows: AccessRow[] } | null = null;

/** 관리자가 설정을 저장하면 호출해 캐시를 즉시 버린다. */
export function invalidateMenuAccessCache() {
  menuAccessCache = null;
}

async function getMenuAccess(): Promise<AccessRow[]> {
  const now = Date.now();
  if (menuAccessCache && now - menuAccessCache.at < MENU_ACCESS_TTL_MS) {
    return menuAccessCache.rows;
  }
  const rows = await prisma.menuAccess.findMany({
    select: { menuKey: true, levelKey: true, canView: true, canEdit: true },
  });
  menuAccessCache = { at: now, rows };
  return rows;
}

/**
 * 레이아웃과 페이지가 같은 요청에서 권한 자료를 여러 번 요구해도 한 번만 읽는다.
 * 요청이 끝나면 캐시도 사라지므로 권한 변경 뒤 오래된 전역 값을 재사용하지 않는다.
 */
const getUserAndMenuAccess = cache(async (userId: string, role?: string) => {
  // role 을 넘겨받으면(세션에 이미 있다) 사용자 조회를 건너뛴다.
  const [resolvedRole, menuAccess] = await Promise.all([
    role !== undefined
      ? Promise.resolve(role)
      : prisma.user
          .findUnique({ where: { id: userId }, select: { role: true } })
          .then((u) => u?.role),
    getMenuAccess(),
  ]);

  return { role: resolvedRole, menuAccess };
});

/** 사이드바에 보여줄 메뉴 목록. */
export async function getAccessibleMenus(userId: string, role?: string): Promise<Set<string>> {
  const { role: resolved, menuAccess } = await getUserAndMenuAccess(userId, role);
  if (resolved === undefined) return new Set();

  return new Set(
    MENU_KEYS.map((menu) => menu.key).filter(
      (menuKey) => resolveMenuAccess(resolved, menuKey, menuAccess).view,
    ),
  );
}

export async function canAccessMenu(userId: string, menuKey: string): Promise<boolean> {
  const { role, menuAccess } = await getUserAndMenuAccess(userId);
  if (role === undefined) return false;
  return resolveMenuAccess(role, menuKey, menuAccess).view;
}

/**
 * 메뉴 안에서 자료를 고칠 수 있는지.
 *
 * 주의: 본인 자료를 만드는 행위(출퇴근 찍기, 휴가 신청)에는 쓰지 말 것.
 * 그건 남의 기록을 손대는 것과 위험도가 다르고, 여기서 막으면 사원이
 * 자기 출퇴근조차 못 찍게 된다.
 */
export async function canEditMenu(
  userId: string,
  menuKey: string,
  role?: string,
): Promise<boolean> {
  const { role: resolved, menuAccess } = await getUserAndMenuAccess(userId, role);
  if (resolved === undefined) return false;
  return resolveMenuAccess(resolved, menuKey, menuAccess).edit;
}

/** 서버 액션에서 쓰는 가드. 권한이 없으면 던진다. */
export async function requireMenuEdit(userId: string, menuKey: string, role?: string) {
  if (!(await canEditMenu(userId, menuKey, role))) {
    throw new Error("수정 권한이 없습니다.");
  }
}

/**
 * 페이지 진입 가드. 접근 권한이 없으면 대시보드로 돌려보낸다.
 *
 * 사이드바에서 메뉴를 숨기는 것만으로는 아무것도 막지 못한다. 주소를 직접 치면
 * 그냥 열리기 때문이다. 서버 컴포넌트 맨 위에서 이 함수를 부르는 것이 실제 차단이다.
 *
 * 대시보드로 보내는 이유는 404 나 오류 화면보다 낫기 때문이다. 권한이 없는 것은
 * 잘못이 아니라 정상 상태다.
 */
export async function requireMenuAccess(userId: string, menuKey: string, role?: string) {
  const { role: resolved, menuAccess } = await getUserAndMenuAccess(userId, role);
  if (resolved === undefined || !resolveMenuAccess(resolved, menuKey, menuAccess).view) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }
}
