// 순수 상수. prisma 를 import 하지 않으므로 클라이언트 컴포넌트에서도 안전하다.
// (permissions.ts 는 prisma 를 쓰므로 클라이언트가 import 하면 pg 드라이버가
//  클라이언트 번들로 끌려 들어가 빌드가 깨진다.)

/**
 * 조직 레벨. User.role 값이 그대로 레벨 key 로 쓰인다.
 *
 * rank 는 "팀장 이상" 같은 기본값을 계산하고 순서를 매기는 데만 쓰고 화면에는
 * 내보내지 않는다. 관리자에게 숫자를 보여주면 "50 과 60 중 뭘 넣나"를 고민하게
 * 되는데, 실제로 필요한 판단은 순서뿐이다.
 */
export const DEFAULT_ACCESS_LEVELS = [
  { key: "admin", name: "관리자", rank: 100, isSystem: true },
  { key: "manager", name: "팀장", rank: 60, isSystem: true },
  { key: "member", name: "사원", rank: 30, isSystem: true },
  { key: "partner", name: "파트너", rank: 10, isSystem: true },
] as const;

/**
 * 승인 대기 상태. 레벨이 아니라 "아직 레벨이 없음"을 뜻하므로 위 목록에 넣지 않는다.
 * 이 값을 가진 사용자는 미들웨어가 /pending 으로 보낸다.
 */
export const PENDING_ROLE = "pending";

/**
 * 레벨 도입 전의 role 값. 그때는 직원이 전부 "user" 였다.
 *
 * 마이그레이션이 아직 안 돈 DB, 그리고 마이그레이션 전에 발급되어 아직 살아 있는
 * 세션 토큰에서 이 값이 넘어온다. 사원으로 취급하지 않으면 그 사이에 전 메뉴가 잠긴다.
 */
export const LEGACY_MEMBER_ROLE = "user";

/** 레벨 key 로 정규화한다. 알 수 없는 값은 그대로 두어 권한 없는 쪽으로 떨어지게 한다. */
export function normalizeLevelKey(role: string | null | undefined): string | null {
  if (!role) return null;
  return role === LEGACY_MEMBER_ROLE ? "member" : role;
}

export const MENU_KEYS = [
  { key: "dashboard", label: "대시보드" },
  { key: "attendance", label: "근태 관리" },
  { key: "leave", label: "휴가 관리" },
  { key: "projects", label: "프로젝트" },
  { key: "calendar", label: "캘린더" },
  { key: "messenger", label: "메신저" },
  { key: "customers", label: "거래처" },
  { key: "partners", label: "파트너" },
  { key: "venues", label: "공간 DB" },
  { key: "finance", label: "재무 관리" },
  { key: "sheets", label: "구글 시트" },
  { key: "credentials", label: "ID 관리" },
  { key: "admin", label: "관리자" },
] as const;

export type MenuKey = (typeof MENU_KEYS)[number]["key"];

const ALL = ["admin", "manager", "member", "partner"];
const MEMBER_UP = ["admin", "manager", "member"];
const MANAGER_UP = ["admin", "manager"];
const ADMIN_ONLY = ["admin"];

/**
 * 메뉴별 기본 권한. 최초 1회 시딩에만 쓰이고, 이후에는 관리자 화면에서 바꾼 값이 정본이다.
 *
 * view 는 메뉴에 들어갈 수 있는지, edit 는 그 안에서 자료를 고칠 수 있는지를 뜻한다.
 *
 * 근태·휴가의 edit 가 관리자 전용인 것은 "남의 기록을 손대는 것"을 막는 뜻이지
 * 본인 출퇴근 찍기나 휴가 신청까지 막는 것이 아니다. 그 둘은 본인 자료를 만드는
 * 행위라 edit 권한과 무관하게 열려 있어야 한다.
 */
export const DEFAULT_MENU_RULES: Record<string, { view: string[]; edit: string[] }> = {
  // 대시보드와 메신저를 막으면 파트너 계정이 로그인 직후 갈 곳이 없어진다.
  dashboard: { view: ALL, edit: [] },
  messenger: { view: ALL, edit: ALL },

  attendance: { view: MEMBER_UP, edit: ADMIN_ONLY },
  leave: { view: MEMBER_UP, edit: ADMIN_ONLY },

  projects: { view: MANAGER_UP, edit: MANAGER_UP },
  calendar: { view: MANAGER_UP, edit: MANAGER_UP },

  customers: { view: MEMBER_UP, edit: MANAGER_UP },
  partners: { view: MEMBER_UP, edit: MANAGER_UP },
  venues: { view: MEMBER_UP, edit: MANAGER_UP },

  finance: { view: MANAGER_UP, edit: ADMIN_ONLY },
  sheets: { view: MANAGER_UP, edit: MANAGER_UP },
  credentials: { view: MANAGER_UP, edit: MANAGER_UP },

  admin: { view: ADMIN_ONLY, edit: ADMIN_ONLY },
};
