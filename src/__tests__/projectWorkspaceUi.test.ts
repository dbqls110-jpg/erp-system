import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectWorkspace } from "@/app/(app)/projects/ProjectWorkspace";
import { parseProjectFilters } from "@/lib/projectFilters";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/app/actions/projectTask", () => ({ saveProjectTaskAction: vi.fn(), deleteProjectTaskAction: vi.fn(), completeProjectTaskAction: vi.fn(), setProjectCompletionAction: vi.fn() }));
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
});
