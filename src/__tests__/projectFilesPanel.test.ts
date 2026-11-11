import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/projectFile", () => ({ uploadProjectFiles: vi.fn(), deleteProjectFile: vi.fn(), retryProjectUploads: vi.fn() }));
vi.mock("@/app/actions/projectQuote", () => ({ previewProjectQuote: vi.fn(), applyProjectQuote: vi.fn() }));
import { ProjectFilesPanel } from "@/app/(app)/projects/[id]/ProjectFilesPanel";
const file = { id: "legacy", name: "내부용 견적서.xlsx", mimeType: "application/xlsx", driveUrl: "https://example.com/fixture", size: 100, category: "견적서", createdAt: new Date("2026-09-30") };
describe("견적서 금액 누락 안내", () => {
  it("첨부만 있고 금액 기록이 없으면 재분석을 안내한다", () => {
    const html = renderToStaticMarkup(createElement(ProjectFilesPanel, { projectId: "project", files: [file], canEdit: true, appliedQuoteFileNames: [] }));
    expect(html).toContain("금액 미반영"); expect(html).toContain('aria-label="내부용 견적서.xlsx 금액 재분석"');
  });
  it("금액이 연결돼 있으면 누락 경고를 표시하지 않는다", () => {
    const html = renderToStaticMarkup(createElement(ProjectFilesPanel, { projectId: "project", files: [file], canEdit: true, appliedQuoteFileNames: [file.name] }));
    expect(html).not.toContain("금액 미반영");
  });
  it("읽기 전용 계정에는 재분석·업로드·삭제 버튼을 노출하지 않는다", () => {
    const html = renderToStaticMarkup(createElement(ProjectFilesPanel, { projectId: "project", files: [file], canEdit: false, appliedQuoteFileNames: [] }));
    expect(html).toContain("금액 미반영"); expect(html).not.toContain("aria-label="); expect(html).not.toContain("파일 업로드");
  });
});
