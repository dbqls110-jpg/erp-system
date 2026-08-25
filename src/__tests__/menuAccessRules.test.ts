import { describe, expect, it } from "vitest";
import { resolveMenuAccess, type AccessRow } from "@/lib/menuAccessRules";
import { DEFAULT_MENU_RULES, MENU_KEYS } from "@/lib/menu-keys";

/** DEFAULT_MENU_RULES 를 DB 에 시딩했을 때 생기는 행들을 그대로 만든다. */
function seededRows(): AccessRow[] {
  const rows: AccessRow[] = [];
  for (const [menuKey, rule] of Object.entries(DEFAULT_MENU_RULES)) {
    const levelKeys = new Set([...rule.view, ...rule.edit]);
    for (const levelKey of levelKeys) {
      rows.push({
        menuKey,
        levelKey,
        canView: rule.view.includes(levelKey),
        canEdit: rule.edit.includes(levelKey),
      });
    }
  }
  return rows;
}

describe("resolveMenuAccess — 잠금 방지 규칙", () => {
  it("관리자는 설정이 어떻든 전부 허용된다", () => {
    // 관리자를 명시적으로 차단해 둔 최악의 설정을 만들어도 통과해야 한다.
    const hostile: AccessRow[] = MENU_KEYS.map((m) => ({
      menuKey: m.key,
      levelKey: "admin",
      canView: false,
      canEdit: false,
    }));
    for (const menu of MENU_KEYS) {
      expect(resolveMenuAccess("admin", menu.key, hostile)).toEqual({ view: true, edit: true });
    }
  });

  it("설정이 하나도 없으면 접근은 열되 수정은 닫는다", () => {
    expect(resolveMenuAccess("member", "finance", [])).toEqual({ view: true, edit: false });
  });

  it("예전 role 인 user 를 사원으로 취급한다", () => {
    const rows = seededRows();
    // 마이그레이션 전 세션 토큰이 "user" 를 들고 와도 사원과 같아야 한다.
    for (const menu of MENU_KEYS) {
      expect(resolveMenuAccess("user", menu.key, rows)).toEqual(
        resolveMenuAccess("member", menu.key, rows),
      );
    }
  });

  it("role 이 없으면 아무것도 허용하지 않는다", () => {
    const rows = seededRows();
    expect(resolveMenuAccess(null, "finance", rows)).toEqual({ view: false, edit: false });
    expect(resolveMenuAccess(undefined, "finance", rows)).toEqual({ view: false, edit: false });
  });

  it("모르는 레벨은 허용하지 않는다", () => {
    expect(resolveMenuAccess("intern", "finance", seededRows())).toEqual({
      view: false,
      edit: false,
    });
  });

  it("canView 없이 canEdit 만 켜진 행은 수정도 막는다", () => {
    const broken: AccessRow[] = [
      { menuKey: "finance", levelKey: "member", canView: false, canEdit: true },
    ];
    expect(resolveMenuAccess("member", "finance", broken)).toEqual({ view: false, edit: false });
  });
});

describe("기본 권한 규칙 — 요구사항과 일치하는지", () => {
  const rows = seededRows();
  const at = (role: string, menu: string) => resolveMenuAccess(role, menu, rows);

  it("재무 관리: 팀장 이상 접근, 관리자만 수정", () => {
    expect(at("manager", "finance")).toEqual({ view: true, edit: false });
    expect(at("member", "finance")).toEqual({ view: false, edit: false });
    expect(at("partner", "finance")).toEqual({ view: false, edit: false });
  });

  it("구글 시트 · ID 관리: 팀장 이상 접근 및 수정", () => {
    for (const menu of ["sheets", "credentials"]) {
      expect(at("manager", menu)).toEqual({ view: true, edit: true });
      expect(at("member", menu)).toEqual({ view: false, edit: false });
    }
  });

  it("근태 · 휴가: 사원 이상 접근, 수정은 관리자만", () => {
    for (const menu of ["attendance", "leave"]) {
      expect(at("member", menu)).toEqual({ view: true, edit: false });
      expect(at("manager", menu)).toEqual({ view: true, edit: false });
      // 파트너는 사원 아래라 근태 대상이 아니다.
      expect(at("partner", menu)).toEqual({ view: false, edit: false });
    }
  });

  it("캘린더 · 프로젝트: 팀장 이상만", () => {
    for (const menu of ["calendar", "projects"]) {
      expect(at("manager", menu).view).toBe(true);
      expect(at("member", menu).view).toBe(false);
    }
  });

  it("공간 DB · 거래처 · 파트너: 사원 이상 접근, 팀장 이상 수정", () => {
    for (const menu of ["venues", "customers", "partners"]) {
      expect(at("member", menu)).toEqual({ view: true, edit: false });
      expect(at("manager", menu)).toEqual({ view: true, edit: true });
      expect(at("partner", menu)).toEqual({ view: false, edit: false });
    }
  });

  it("파트너도 대시보드와 메신저는 쓸 수 있다", () => {
    // 둘 다 막으면 로그인 직후 갈 곳이 없어진다.
    expect(at("partner", "dashboard").view).toBe(true);
    expect(at("partner", "messenger").view).toBe(true);
  });

  it("관리자 메뉴는 관리자 전용이다", () => {
    expect(at("manager", "admin")).toEqual({ view: false, edit: false });
  });

  it("모든 메뉴에 기본 규칙이 정의돼 있다", () => {
    // 빠뜨린 메뉴는 규칙 2 때문에 조용히 전원 공개가 된다.
    for (const menu of MENU_KEYS) {
      expect(DEFAULT_MENU_RULES[menu.key], `${menu.key} 규칙 없음`).toBeDefined();
    }
  });
});
