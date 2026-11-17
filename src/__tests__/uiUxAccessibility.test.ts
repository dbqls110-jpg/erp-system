import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseInquiryRows } from "@/lib/inquiries";
vi.mock("@/app/actions/inquiries", () => ({
  createProjectFromInquiry: vi.fn(), updateInquiryMemo: vi.fn(), updateInquiryStage: vi.fn(),
}));
import { InquiriesKanban } from "@/app/(app)/inquiries/InquiriesKanban";

function luminance(hex: string) {
  const channels = hex.match(/[a-f0-9]{2}/gi)?.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  if (!channels || channels.length !== 3) throw Error("Invalid color fixture");
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}
describe("UI 접근성 회귀", () => {
  it("보조 글자는 흰 바탕과 muted 카드 모두 4.5:1 이상이다", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const foreground = /--muted-foreground:\s*(#[a-f0-9]{6})/i.exec(css)?.[1];
    expect(foreground).toBeDefined();
    if (!foreground) throw Error("Missing muted token");
    for (const background of ["#ffffff", "#e9ebf0", "#edf6fd"]) {
      const contrast = (luminance(background) + 0.05) / (luminance(foreground) + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("문의 상세 진입은 제목의 이름 있는 네이티브 버튼이다", () => {
    const inquiries = parseInquiryRows([[], ["2026-11-13 09:00", "김예시", "qa@example.invalid", "010-0000-0000", "대관", "서울", "UI 검증", "문의"]]);
    const html = renderToStaticMarkup(createElement(InquiriesKanban, { initialInquiries: inquiries, canEdit: false }));
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="김예시 문의 상세 보기"/);
    expect(html).not.toContain('title="더블클릭하여 상세 보기"');
  });
});
