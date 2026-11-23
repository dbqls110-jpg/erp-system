import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectWorkspace } from "@/app/(app)/projects/ProjectWorkspace";
import { parseProjectFilters, parseProjectWorkspaceView } from "@/lib/projectFilters";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/app/actions/projectTask", () => ({ saveProjectTaskAction: vi.fn(), deleteProjectTaskAction: vi.fn(), completeProjectTaskAction: vi.fn(), setProjectCompletionAction: vi.fn(), recheckProjectTaskTomorrowAction: vi.fn() }));
vi.mock("@/app/actions/project", () => ({ deleteProject: vi.fn() }));

describe("project workspace navigation", () => {
  it("keeps the project list as the default and exposes separate Today and Kanban views", () => {
    const html = renderToStaticMarkup(createElement(ProjectWorkspace, {
      projects: [], attentionTasks: [], people: [], viewerId: "staff", today: "2026-11-20", canEdit: true, isAdmin: false,
      filters: parseProjectFilters({}, 2026), filterControls: null, createControl: null,
    }));
    expect(html).toContain('aria-label="프로젝트 보기"');
    expect(html).toContain("오늘 할 일");
    expect(html).toContain("칸반");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('id="today-tasks-title"');
  });
  it("opens a direct Today URL with all six tasks, never the project cards", () => {
    const view = parseProjectWorkspaceView(new URL("https://fixture.invalid/projects?view=today").searchParams.get("view"));
    const html = renderToStaticMarkup(createElement(ProjectWorkspace, {
      view, projects: [], people: [], viewerId: "staff", today: "2026-11-20", canEdit: true, isAdmin: false,
      attentionTasks: Array.from({ length: 6 }, (_, i) => ({
        id: `t${i}`, projectId: "p", projectName: "테스트 프로젝트", projectStatus: "active", content: `할 일 표본 ${i}`,
        assigneeId: "staff", assigneeName: "직원", isDone: false, completedAt: null, taskStatus: i === 0 ? "waiting" : "todo",
        nextCheckDate: "2026-11-20", dueDate: i === 1 ? "2026-11-20" : null, waitingOn: null, version: 0, order: i,
      })),
      filters: parseProjectFilters({}, 2026), filterControls: null, createControl: null,
    }));
    expect(html).toContain('id="today-tasks-title"');
    expect(html).toContain("할 일 표본 5");
    expect(html).toContain("오늘 마감");
    expect(html).toContain("오늘 확인");
    expect(html.match(/내일 다시 확인/g)).toHaveLength(1);
    expect(html).not.toContain('id="project-list-title"');
  });
});
