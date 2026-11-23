import { describe, expect, it } from "vitest";
import { defaultTaskAssignee, parseTaskDraft, parseTaskDate, nextProjectTask, todayProjectTasks, taskAttentionLabel, projectTaskCalendarEvents, projectTaskPreview, type ProjectTask } from "@/lib/projectTaskPolicy";

function task(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return { id: "t1", projectId: "p1", content: "최종 시안 회신 확인", isDone: false, completedAt: null, order: 0,
    assigneeId: "staff-a", assigneeName: "직원 A", taskStatus: "waiting", nextCheckDate: "2026-11-17", dueDate: null,
    waitingOn: "고객", version: 0, ...overrides };
}
describe("프로젝트 할 일의 한 원본 · 오늘 · 캘린더", () => {
  it("한 건 추가할 때도 입력자가 아닌 프로젝트 담당자를 기본 선택한다", () => {
    const people = [{ id: "creator", name: "입력 직원" }, { id: "lead", name: "팀 담당" }];
    expect(defaultTaskAssignee(people, " 팀 담당 ")).toBe("lead");
    expect(defaultTaskAssignee(people, "찾을 수 없는 직원")).toBe("");
    expect(defaultTaskAssignee([...people, { id: "another", name: "팀 담당" }], "팀 담당")).toBe("");
    expect(defaultTaskAssignee(people)).toBe("");
  });
  it("날짜 미정은 오늘 날짜로 채우지 않고 기본 데이터에 남긴다", () => {
    const parsed = parseTaskDraft({ projectId: "p1", content: "  시안 확인  ", taskStatus: "todo" });
    expect(parsed).toMatchObject({ content: "시안 확인", assigneeId: null, nextCheckDate: null, dueDate: null, waitingOn: null });
    expect(todayProjectTasks([task({ ...parsed })], "2026-11-17", null)).toEqual([]);
  });
  it.each(["2026-02-29", "2026-13-01", "2026-00-10", "2026-11-31", "26-11-17", "2026-11-17T00:00:00Z"])("잘못된 날짜를 저장하지 않는다: %s", value => {
    expect(() => parseTaskDate(value)).toThrow();
  });
  it("윤년을 처리하고 빈 날짜는 미정으로 둔다", () => {
    expect(parseTaskDate("2028-02-29")).toBe("2028-02-29"); expect(parseTaskDate("")).toBeNull();
  });
  it("오늘과 지난 날짜만 모으고 담당자 ID로 내 업무를 구분한다", () => {
    const rows = [task(), task({ id: "past", nextCheckDate: "2026-11-16" }), task({ id: "future", nextCheckDate: "2026-11-18" }),
      task({ id: "done", isDone: true }), task({ id: "other", assigneeId: "staff-b" }), task({ id: "none", nextCheckDate: null })];
    expect(todayProjectTasks(rows, "2026-11-17", "staff-a").map(t => t.id)).toEqual(["past", "t1"]);
    expect(todayProjectTasks(rows, "2026-11-17", null).map(t => t.id)).toEqual(["past", "other", "t1"]);
  });
  it("확인일이 미래여도 마감일이 지났으면 놓치지 않고 마감으로 표시한다", () => {
    const row = task({ nextCheckDate: "2026-11-20", dueDate: "2026-11-16" });
    expect(todayProjectTasks([row], "2026-11-17", "staff-a")).toEqual([row]);
    expect(taskAttentionLabel(row, "2026-11-17")).toBe("11/16 마감일 지남");
  });
  it("실제 마감 우선으로 정렬하고 대시보드만 5건으로 제한한다", () => {
    const rows = [
      task({ id: "check-old", nextCheckDate: "2026-11-01" }),
      task({ id: "check-1" }), task({ id: "check-2" }), task({ id: "check-3" }),
      task({ id: "due-today", dueDate: "2026-11-17", nextCheckDate: "2026-11-10" }),
      task({ id: "overdue", dueDate: "2026-11-16", nextCheckDate: "2026-11-18" }),
      task({ id: "other", assigneeId: "staff-b", dueDate: "2026-11-12" }),
    ];
    const ordered = todayProjectTasks(rows, "2026-11-17", "staff-a");
    expect(ordered.map(t => t.id)).toEqual(["overdue", "due-today", "check-old", "check-1", "check-2", "check-3"]);
    expect(projectTaskPreview(ordered)).toEqual({ total: 6, tasks: ordered.slice(0, 5) });
  });
  it("완료한 업무를 다음 할 일로 재노출하지 않는다", () => {
    const row = task({ id: "open", nextCheckDate: null });
    expect(nextProjectTask([task({ isDone: true }), row])).toEqual(row);
    expect(nextProjectTask([task({ isDone: true })])).toBeNull();
  });
  it("같은 날 확인과 마감은 캘린더 한 건, 다른 날은 두 건이다", () => {
    const same = { ...task({ dueDate: "2026-11-17" }), projectName: "인쇄 프로젝트" };
    const events = projectTaskCalendarEvents([same], "2026-11-01", "2026-11-30");
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ id: "task:t1:both", date: "2026-11-17", projectId: "p1" });
    expect(events[0].title).toContain("확인·마감");
    expect(projectTaskCalendarEvents([{ ...same, dueDate: "2026-11-20" }], "2026-11-01", "2026-11-30")).toHaveLength(2);
  });
  it("월 경계·날짜 변경·미정을 즉시 반영하고 완료 이력은 남긴다", () => {
    const row = { ...task({ nextCheckDate: "2026-12-01", dueDate: null }), projectName: "웹 제작" };
    expect(projectTaskCalendarEvents([row], "2026-11-01", "2026-11-30")).toEqual([]);
    expect(projectTaskCalendarEvents([{ ...row, nextCheckDate: null }], "2026-12-01", "2026-12-31")).toEqual([]);
    expect(projectTaskCalendarEvents([{ ...row, isDone: true }], "2026-12-01", "2026-12-31")[0]).toMatchObject({ isDone: true, title: expect.stringContaining("완료") });
  });
});
