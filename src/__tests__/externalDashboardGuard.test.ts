/**
 * 외부인(파트너·거래처)은 어떤 경우에도 내부 대시보드와 남의 프로젝트를 보지 못한다.
 *
 * 화면 분기(getDashboardAudience), 자료 조건(projectWhereFor/calendarWhereFor),
 * 메뉴 권한(resolveMenuAccess) 세 겹을 모두 고정한다. 하나가 풀려도 나머지가 막아야 한다.
 */
import { describe, expect, it } from "vitest";
import { getDashboardAudience } from "@/lib/dashboardVisibility";
import {
  calendarWhereFor,
  canEditCalendar,
  isExternal,
  projectWhereFor,
  showLeaves,
  showNotionEvents,
  type Viewer,
} from "@/lib/calendarVisibility";
import { resolveMenuAccess, type AccessRow } from "@/lib/menuAccessRules";
import { DEFAULT_MENU_RULES, MENU_KEYS } from "@/lib/menu-keys";

const outsiders: Record<string, Viewer> = {
  "파트너사 연결된 파트너": { id: "p1", role: "partner", partnerId: "partner-a", customerId: null },
  "연결 안 된 파트너 레벨": { id: "p2", role: "partner", partnerId: null, customerId: null },
  "거래처 담당자": { id: "c1", role: "member", partnerId: null, customerId: "cust-a" },
  "레벨은 팀장인데 파트너사에 연결": { id: "p3", role: "manager", partnerId: "partner-b", customerId: null },
};

const insiders: Record<string, Viewer> = {
  관리자: { id: "a1", role: "admin", partnerId: null, customerId: null },
  팀장: { id: "m1", role: "manager", partnerId: null, customerId: null },
  사원: { id: "s1", role: "member", partnerId: null, customerId: null },
};

describe("외부인 판정", () => {
  for (const [label, viewer] of Object.entries(outsiders)) {
    it(`${label} → 외부 대시보드`, () => {
      expect(isExternal(viewer)).toBe(true);
      expect(getDashboardAudience(viewer)).toBe("external");
    });
  }
  for (const [label, viewer] of Object.entries(insiders)) {
    it(`${label} → 내부 대시보드`, () => {
      expect(isExternal(viewer)).toBe(false);
      expect(getDashboardAudience(viewer)).toBe("internal");
    });
  }
});

describe("외부인에게 붙는 자료 조건", () => {
  it("연결 안 된 파트너 레벨은 프로젝트·일정이 하나도 안 걸린다", () => {
    const v = outsiders["연결 안 된 파트너 레벨"];
    expect(projectWhereFor(v)).toEqual({ id: { in: [] } });
    expect(calendarWhereFor(v)).toEqual({ id: { in: [] } });
  });
  it("연결된 파트너는 자기 파트너사 프로젝트만", () => {
    const v = outsiders["파트너사 연결된 파트너"];
    expect(projectWhereFor(v)).toEqual({ OR: [{ partners: { some: { partnerId: "partner-a" } } }] });
  });
  it("외부인은 휴가·노션 일정을 못 보고 일정을 못 고친다", () => {
    for (const v of Object.values(outsiders)) {
      expect(showLeaves(v)).toBe(false);
      expect(showNotionEvents(v)).toBe(false);
      expect(canEditCalendar(v)).toBe(false);
    }
  });
  it("내부 직원에게는 조건이 없다", () => {
    expect(projectWhereFor(insiders.사원)).toEqual({});
  });
});

describe("파트너 레벨의 메뉴 권한(기본 규칙)", () => {
  const rows: AccessRow[] = Object.entries(DEFAULT_MENU_RULES).flatMap(([menuKey, rule]) =>
    ["admin", "manager", "member", "partner"].map((levelKey) => ({
      menuKey,
      levelKey,
      canView: rule.view.includes(levelKey),
      canEdit: rule.edit.includes(levelKey),
    })),
  );
  const PARTNER_ALLOWED = new Set(["dashboard", "messenger", "calendar"]);

  for (const menu of MENU_KEYS) {
    const shouldView = PARTNER_ALLOWED.has(menu.key);
    it(`${menu.label}: 파트너 ${shouldView ? "보기만" : "차단"}`, () => {
      const access = resolveMenuAccess("partner", menu.key, rows);
      expect(access.view).toBe(shouldView);
      // 메신저 외에는 어떤 메뉴도 고칠 수 없다
      if (menu.key !== "messenger") expect(access.edit).toBe(false);
    });
  }
});
