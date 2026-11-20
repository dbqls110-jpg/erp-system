import { describe, expect, it } from "vitest";
import { eventReminder, parseProjectWorkspace } from "@/lib/projectReminderPolicy";
import { projectTaskCalendarEvents, type ProjectTask } from "@/lib/projectTaskPolicy";

describe("actual event reminder policy", () => {
  it.each([
    ["performance", "2027-04-21", "2026-11-20", "2027-03-21"],
    ["performance", "2027-03-31", "2026-11-20", "2027-02-28"],
    ["event", "2026-12-20", "2026-11-20", "2026-12-13"],
    ["event", "2026-12-10", "2026-11-20", "2026-12-03"],
    ["event", "2026-11-27", "2026-11-20", "2026-11-26"],
    ["event", "2026-11-22", "2026-11-20", "2026-11-21"],
  ])("%s %s registered %s reminds on %s", (type, date, registered, expected) => {
    expect(eventReminder(type, date, registered)?.date).toBe(expected);
  });
  it("does not invent dates for general work, unknown dates or past events", () => {
    expect(eventReminder("general", "2026-12-01", "2026-11-20")).toBeNull();
    expect(eventReminder("event", null, "2026-11-20")).toBeNull();
    expect(eventReminder("event", "2026-11-01", "2026-11-20")).toBeNull();
    expect(eventReminder("event", "2026-11-20", "2026-11-20")?.date).toBe("2026-11-20");
  });
  it("clamps an already-passed reminder to the registration day", () => {
    expect(eventReminder("performance", "2026-12-01", "2026-11-20")?.date).toBe("2026-11-20");
  });
  it("shows the actual event date separately and does not complete the event by checking its reminder", () => {
    const task: ProjectTask & { projectName: string } = { id: "reminder-one", projectId: "p1", projectName: "4월 공연", content: "공연 한 달 전 준비 확인 (2027-04-21)", assigneeId: null, assigneeName: null, nextCheckDate: "2027-03-21", dueDate: "2027-04-21", taskStatus: "todo", waitingOn: null, order: 0, version: 1, isDone: true, completedAt: "2027-03-21T01:00:00Z" };
    const events = projectTaskCalendarEvents([task], "2027-03-01", "2027-04-30");
    expect(events[0].isDone).toBe(true);
    expect(events[1]).toMatchObject({ date: "2027-04-21", title: "4월 공연 · 실제 공연·행사일", isDone: false });
  });
  it("keeps unknown dates null, permits quote-only work and rejects invalid input", () => {
    expect(parseProjectWorkspace({})).toEqual({ workScope: null, eventType: "general", eventDate: null, initialTasks: [] });
    expect(parseProjectWorkspace({ workScope: "  인쇄  ", initialTasks: "시안 확인\n\n인쇄 발주" }).initialTasks).toEqual(["시안 확인", "인쇄 발주"]);
    for (const input of [{ eventType: "fake" }, { eventDate: "2026-02-30" }, { workScope: "x".repeat(1001) }, { initialTasks: Array(52).fill("할 일").join("\n") }]) expect(() => parseProjectWorkspace(input)).toThrow();
  });
});
