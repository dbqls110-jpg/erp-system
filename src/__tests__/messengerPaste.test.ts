/**
 * 클립보드 이미지 → 첨부 파일
 */
import { describe, it, expect } from "vitest";
import { imageFileFromClipboard, pastedImageName, isImageAttachment } from "@/lib/messengerPaste";

const at = new Date(2026, 8, 16, 14, 5, 9);

function item(kind: string, type: string, file: File | null) {
  return { kind, type, getAsFile: () => file };
}

describe("imageFileFromClipboard", () => {
  it("image/* 파일 항목을 시각 이름을 붙인 File 로 꺼낸다", () => {
    const raw = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
    const file = imageFileFromClipboard([item("string", "text/plain", null), item("file", "image/png", raw)], at);
    expect(file?.name).toBe("붙여넣기_20260916_140509.png");
    expect(file?.type).toBe("image/png");
    expect(file?.size).toBe(3);
  });
  it("글자만 있으면 null — 평소 붙여넣기를 막지 않는다", () => {
    expect(imageFileFromClipboard([item("string", "text/plain", null)], at)).toBeNull();
  });
  it("이미지가 아닌 파일은 무시", () => {
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    expect(imageFileFromClipboard([item("file", "application/pdf", pdf)], at)).toBeNull();
  });
});

describe("pastedImageName / isImageAttachment", () => {
  it("jpeg 는 jpg 확장자", () => {
    expect(pastedImageName("image/jpeg", at)).toBe("붙여넣기_20260916_140509.jpg");
  });
  it("이미지 MIME 만 true", () => {
    expect(isImageAttachment("image/webp")).toBe(true);
    expect(isImageAttachment("application/pdf")).toBe(false);
    expect(isImageAttachment(null)).toBe(false);
  });
});
