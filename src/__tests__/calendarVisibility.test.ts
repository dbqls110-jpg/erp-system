import { describe, expect, it } from "vitest";
import {
  calendarWhereFor,
  canEditCalendar,
  isExternal,
  projectWhereFor,
  sanitizeEventFor,
  showLeaves,
  showNotionEvents,
  type Viewer,
} from "@/lib/calendarVisibility";

const staff: Viewer = { id: "u1", role: "member", partnerId: null, customerId: null };
const admin: Viewer = { id: "u2", role: "admin", partnerId: null, customerId: null };
const partner: Viewer = { id: "u3", role: "partner", partnerId: "p1", customerId: null };
const customer: Viewer = { id: "u4", role: "partner", partnerId: null, customerId: "c1" };

describe("isExternal — 연결이 신분이다", () => {
  it("내부 직원은 외부가 아니다", () => {
    expect(isExternal(staff)).toBe(false);
    expect(isExternal(admin)).toBe(false);
  });

  it("파트너·거래처에 연결돼 있으면 외부다", () => {
    expect(isExternal(partner)).toBe(true);
    expect(isExternal(customer)).toBe(true);
  });

  it("role 이 높아도 연결이 있으면 외부로 본다", () => {
    // 관리자가 실수로 role 을 높게 줬을 때 회사 일정이 통째로 새면 안 된다.
    // 연결이 곧 신분이다.
    const misconfigured: Viewer = { id: "u5", role: "admin", partnerId: "p1", customerId: null };
    expect(isExternal(misconfigured)).toBe(true);
    expect(canEditCalendar(misconfigured)).toBe(false);
  });

  it("role 이 partner 여도 연결이 없으면 내부로 본다", () => {
    // 반대 방향. 연결이 없으면 어느 파트너인지 알 수 없어 가릴 기준이 없다.
    const noLink: Viewer = { id: "u6", role: "partner", partnerId: null, customerId: null };
    expect(isExternal(noLink)).toBe(false);
  });
});

describe("calendarWhereFor — 무엇을 보여줄 것인가", () => {
  it("내부 직원에게는 조건을 걸지 않는다", () => {
    expect(calendarWhereFor(staff)).toEqual({});
    expect(calendarWhereFor(admin)).toEqual({});
  });

  it("파트너는 자기가 참여한 프로젝트의 일정만 본다", () => {
    expect(calendarWhereFor(partner)).toEqual({
      project: { is: { OR: [{ partners: { some: { partnerId: "p1" } } }] } },
    });
  });

  it("거래처는 자기 프로젝트의 일정만 본다", () => {
    expect(calendarWhereFor(customer)).toEqual({
      project: { is: { OR: [{ customers: { some: { customerId: "c1" } } }] } },
    });
  });

  it("프로젝트가 없는 일정은 외부에 보이지 않는다", () => {
    // where 가 project 관계를 요구하므로 projectId 가 null 인 행은 걸러진다.
    // 기본을 공개로 두면 실수로 비워 둔 내부 회의가 거래처에 노출된다.
    const where = calendarWhereFor(partner) as { project?: unknown };
    expect(where.project).toBeDefined();
  });

  it("파트너이면서 거래처이기도 하면 둘 다 본다", () => {
    const both: Viewer = { id: "u7", role: "partner", partnerId: "p1", customerId: "c1" };
    const where = calendarWhereFor(both) as { project: { is: { OR: unknown[] } } };
    expect(where.project.is.OR).toHaveLength(2);
  });
});

describe("canEditCalendar", () => {
  it("내부 직원만 고칠 수 있다", () => {
    expect(canEditCalendar(staff)).toBe(true);
    expect(canEditCalendar(admin)).toBe(true);
  });

  it("외부 사용자는 자기 프로젝트라도 못 고친다", () => {
    // 우리 쪽 기록이 밖에서 바뀌면 안 된다. 바꿔 달라는 말은 메신저로 받는다.
    expect(canEditCalendar(partner)).toBe(false);
    expect(canEditCalendar(customer)).toBe(false);
  });
});

describe("sanitizeEventFor", () => {
  const event = {
    id: "e1",
    title: "가을축제 촬영",
    date: "2026-10-05",
    createdBy: "u1",
    notionPageId: "notion-123",
  };

  it("내부 직원에게는 그대로 준다", () => {
    expect(sanitizeEventFor(staff, event)).toEqual(event);
  });

  it("외부 사용자에게는 내부 사정을 지운다", () => {
    // where 로 걸러도 남은 일정 안에 내부 정보가 적혀 있다.
    const seen = sanitizeEventFor(partner, event) as Record<string, unknown>;
    expect(seen.createdBy).toBeUndefined();
    expect(seen.notionPageId).toBeUndefined();
    expect(seen.title).toBe("가을축제 촬영");
  });
});

describe("캘린더의 나머지 자료 — 일정만 가려서는 부족하다", () => {
  it("프로젝트 마감일도 자기 것만 보인다", () => {
    // 일정만 가리고 프로젝트를 그대로 두면 남의 행사 이름과 마감일이 노출된다.
    expect(projectWhereFor(staff)).toEqual({});
    expect(projectWhereFor(partner)).toEqual({
      OR: [{ partners: { some: { partnerId: "p1" } } }],
    });
  });

  it("직원 휴가는 외부인에게 보이지 않는다", () => {
    // 누가 언제 쉬는지는 회사 안의 일이다.
    expect(showLeaves(staff)).toBe(true);
    expect(showLeaves(partner)).toBe(false);
    expect(showLeaves(customer)).toBe(false);
  });

  it("노션 일정은 외부인에게 보이지 않는다", () => {
    // 노션 쪽 내용은 우리가 통제하지 못하고 프로젝트와 연결되지도 않아
    // 어느 것이 누구 것인지 가릴 방법이 없다.
    expect(showNotionEvents(staff)).toBe(true);
    expect(showNotionEvents(partner)).toBe(false);
  });

  it("연결이 없는 외부 계정은 프로젝트도 못 본다", () => {
    const orphan: Viewer = { id: "u9", role: "partner", partnerId: "p-gone", customerId: null };
    const where = projectWhereFor(orphan) as { OR?: unknown[] };
    expect(where.OR).toHaveLength(1);
  });
});
