// 순수 상수. prisma 를 import 하지 않으므로 클라이언트 컴포넌트에서도 안전하다.
// (permissions.ts 는 prisma 를 쓰므로 클라이언트가 import 하면 pg 드라이버가
//  클라이언트 번들로 끌려 들어가 빌드가 깨진다.)

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
