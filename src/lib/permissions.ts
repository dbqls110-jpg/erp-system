import { prisma } from "@/lib/prisma";
import { DEFAULT_ACCESS_LEVELS, MENU_KEYS } from "@/lib/menu-keys";

export { DEFAULT_ACCESS_LEVELS, MENU_KEYS };

/**
 * 메뉴 접근 설정을 캐시한다.
 *
 * (app)/layout.tsx 가 모든 인증 페이지에서 이 값을 읽으므로, 캐시가 없으면
 * 페이지를 열 때마다 Supabase(us-east-1)로 왕복이 한 번 더 생긴다. 이 설정은
 * 관리자가 저장할 때만 바뀌므로 자주 읽고 거의 안 쓰는 데이터다.
 */
const MENU_ACCESS_TTL_MS = 60_000;
let menuAccessCache: { at: number; rows: { menuKey: string; levelKey: string }[] } | null = null;

/** 관리자가 설정을 저장하면 호출해 캐시를 즉시 버린다. */
export function invalidateMenuAccessCache() {
  menuAccessCache = null;
}

async function getMenuAccess() {
  const now = Date.now();
  if (menuAccessCache && now - menuAccessCache.at < MENU_ACCESS_TTL_MS) {
    return menuAccessCache.rows;
  }
  const rows = await prisma.menuAccess.findMany({
    select: { menuKey: true, levelKey: true },
  });
  menuAccessCache = { at: now, rows };
  return rows;
}

async function getUserAndMenuAccess(userId: string, role?: string) {
  // role 을 넘겨받으면(세션에 이미 있다) 사용자 조회를 건너뛴다.
  const [resolvedRole, menuAccess] = await Promise.all([
    role !== undefined
      ? Promise.resolve(role)
      : prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
          .then((u) => u?.role),
    getMenuAccess(),
  ]);

  return { role: resolvedRole, menuAccess };
}

function isMenuAllowed(
  role: string | null | undefined,
  menuKey: string,
  menuAccess: ReadonlyArray<{ menuKey: string; levelKey: string }>,
) {
  // Rule 1: role === "admin" always grants every menu to prevent an accidental lockout.
  if (role === "admin") return true;

  const accessForMenu = menuAccess.filter((access) => access.menuKey === menuKey);

  // Rule 2: no MenuAccess rows for a menu means everyone is allowed for backward compatibility.
  if (accessForMenu.length === 0) return true;

  // Rule 3: when rows exist, allow only if the user's level key is in that menu's list.
  // Rule 4: User.role is used as the level key; no separate user level column is required.
  return role !== null && role !== undefined
    ? accessForMenu.some((access) => access.levelKey === role)
    : false;
}

export async function getAccessibleMenus(userId: string, role?: string): Promise<Set<string>> {
  const { role: resolved, menuAccess } = await getUserAndMenuAccess(userId, role);
  if (resolved === undefined) return new Set();

  return new Set(
    MENU_KEYS.map((menu) => menu.key).filter((menuKey) =>
      isMenuAllowed(resolved, menuKey, menuAccess),
    ),
  );
}

export async function canAccessMenu(userId: string, menuKey: string): Promise<boolean> {
  const { role, menuAccess } = await getUserAndMenuAccess(userId);
  if (role === undefined) return false;

  return isMenuAllowed(role, menuKey, menuAccess);
}
