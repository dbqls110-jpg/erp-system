import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardTodayTasks } from "@/components/projects/DashboardTodayTasks";
import type { ProjectTask } from "@/lib/projectTaskPolicy";

describe("dashboard today work preview", () => {
  it("renders five of six tasks and a single link to the dedicated Today view", () => {
    const due: (ProjectTask & { projectName: string })[] = Array.from({ length: 6 }, (_, i) => ({
      id: `task-${i}`, content: `대시보드 할 일 ${i}`, projectId: "test-project", projectName: "테스트 행사",
      order: i, isDone: false, completedAt: null, assigneeId: "test-worker", assigneeName: "담당자",
      taskStatus: "todo", nextCheckDate: null, dueDate: "2026-11-23", waitingOn: null, version: 0,
    }));
    const html = renderToStaticMarkup(createElement(DashboardTodayTasks, { tasks: due, today: "2026-11-23" }));
    expect(html).toContain("전체 6건 보기");
    expect(html.match(/href="\/projects\?view=today"/g)).toHaveLength(1);
    expect(html).toContain("대시보드 할 일 4");
    expect(html).not.toContain("대시보드 할 일 5");
  });
});
