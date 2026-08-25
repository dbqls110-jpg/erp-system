import { prisma } from "@/lib/prisma";

export const DEFAULT_ACCESS_LEVELS = [
  { key: "admin", name: "\uAD00\uB9AC\uC790", rank: 100, isSystem: true },
  { key: "manager", name: "\uD300\uC7A5", rank: 50, isSystem: true },
  { key: "member", name: "\uC0AC\uC6D0", rank: 10, isSystem: true },
] as const;

export const MENU_KEYS = [
  { key: "dashboard", label: "\uB300\uC2DC\uBCF4\uB4DC" },
  { key: "attendance", label: "\uADFC\uD0DC \uAD00\uB9AC" },
  { key: "leave", label: "\uD734\uAC00 \uAD00\uB9AC" },
  { key: "projects", label: "\uD504\uB85C\uC81D\uD2B8" },
  { key: "calendar", label: "\uCEA0\uB9B0\uB354" },
  { key: "messenger", label: "\uBA54\uC2E0\uC800" },
  { key: "customers", label: "\uAC70\uB798\uCC98" },
  { key: "partners", label: "\uD30C\uD2B8\uB108" },
  { key: "venues", label: "\uACF5\uAC04 DB" },
  { key: "finance", label: "\uC7AC\uBB34 \uAD00\uB9AC" },
  { key: "sheets", label: "\uAD6C\uAE00 \uC2DC\uD2B8" },
  { key: "credentials", label: "ID \uAD00\uB9AC" },
  { key: "admin", label: "\uAD00\uB9AC\uC790" },
] as const;

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
