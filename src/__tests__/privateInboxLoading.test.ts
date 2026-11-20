import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Mail } from "lucide-react";
import { describe, expect, it } from "vitest";
import { InquiryChannelFlow, type InquiryFlowChannel } from "@/app/(app)/inquiries/InquiryChannelFlow";

describe("mail connection receipt states", () => {
  it.each([
    ["loading", "연결 확인 중"],
    ["unavailable", "조회 실패"],
  ])("does not call a %s account disconnected", (kind, label) => {
    const html = renderToStaticMarkup(createElement(InquiryChannelFlow, {
      channels: [{ name: "Gmail", icon: Mail, connection: { kind } } as InquiryFlowChannel],
      selectedFilter: "all", total: 0, preview: [], onSelect() {}, onPreview() {},
    }));
    expect(html).toContain(label);
    expect(html).not.toContain("미연결");
  });
});
