import { normalizeLevelKey } from "@/lib/menu-keys";

/**
 * 메뉴 권한 판정. prisma 를 import 하지 않는 순수 함수라 테스트에서 그대로 부를 수 있다.
 *
 * 잠금 사고를 막는 규칙이 둘 있고, 둘 다 의도적으로 "막지 않는" 쪽으로 기운다.
 * 잘못 열리면 나중에 조이면 되지만, 잘못 잠기면 관리자조차 못 들어가 고칠 수 없다.
 */

export interface AccessRow {
  menuKey: string;
  levelKey: string;
  canView: boolean;
  canEdit: boolean;
}

export interface MenuPermission {
  view: boolean;
  edit: boolean;
}

export function resolveMenuAccess(
  role: string | null | undefined,
  menuKey: string,
  menuAccess: ReadonlyArray<AccessRow>,
): MenuPermission {
  // 규칙 1: 관리자는 언제나 전부 허용한다. 설정을 어떻게 저장했든 관리자가
  // 자기 발등을 찍고 관리자 화면에서 잠기는 일이 없어야 한다.
  if (role === "admin") return { view: true, edit: true };

  // 예전 "user" role 은 사원으로 본다. 마이그레이션 도중이거나 세션 토큰이
  // 아직 옛 값을 들고 있을 때 전 메뉴가 잠기는 것을 막는다.
  const levelKey = normalizeLevelKey(role);

  const rowsForMenu = menuAccess.filter((row) => row.menuKey === menuKey);

  // 규칙 2: 설정이 하나도 없는 메뉴는 전원 접근 허용. 시딩 전 상태에서 화면이
  // 통째로 잠기지 않게 하기 위함이다. 다만 수정 권한까지 열지는 않는다 —
  // 들어가 보는 것과 남의 자료를 고치는 것은 위험도가 다르다.
  if (rowsForMenu.length === 0) return { view: true, edit: false };

  if (!levelKey) return { view: false, edit: false };

  const row = rowsForMenu.find((r) => r.levelKey === levelKey);
  if (!row) return { view: false, edit: false };

  // canView 없이 canEdit 만 켜진 행은 의미가 없다. 그런 값이 저장돼 있더라도
  // 접근은 못 하는데 수정은 되는 상태가 생기지 않도록 view 를 함께 요구한다.
  return { view: row.canView, edit: row.canView && row.canEdit };
}
