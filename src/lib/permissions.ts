import { prisma } from "@/lib/prisma";
import { DEFAULT_ACCESS_LEVELS, MENU_KEYS } from "@/lib/menu-keys";

export { DEFAULT_ACCESS_LEVELS, MENU_KEYS };

async function getUserAndMenuAccess(userId: string) {
  const [user, menuAccess] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
    prisma.menuAccess.findMany({
      select: { menuKey: true, levelKey: true },
    }),
  ]);

  return { role: user?.role, menuAccess };
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

export async function getAccessibleMenus(userId: string): Promise<Set<string>> {
  const { role, menuAccess } = await getUserAndMenuAccess(userId);
  if (role === undefined) return new Set();

  return new Set(
    MENU_KEYS.map((menu) => menu.key).filter((menuKey) =>
      isMenuAllowed(role, menuKey, menuAccess),
    ),
  );
}

export async function canAccessMenu(userId: string, menuKey: string): Promise<boolean> {
  const { role, menuAccess } = await getUserAndMenuAccess(userId);
  if (role === undefined) return false;

  return isMenuAllowed(role, menuKey, menuAccess);
}
