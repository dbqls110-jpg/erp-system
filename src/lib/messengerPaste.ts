/**
 * 클립보드에서 붙여넣은 이미지를 첨부 파일로 바꾼다.
 *
 * 카톡·브라우저에서 복사한 이미지는 클립보드에 파일이 아니라 image/* 항목으로 들어온다.
 * 파일 선택창 없이 Ctrl+V 로 바로 보내려면 그 항목을 File 로 꺼내 이름을 붙여야 한다.
 * 텍스트만 붙여넣을 때는 null 을 돌려 평소 붙여넣기를 방해하지 않는다.
 */

export interface ClipboardItemLike {
  kind: string;
  type: string;
  getAsFile(): File | null;
}

export function pastedImageName(mimeType: string, at: Date = new Date()): string {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "png";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}_${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `붙여넣기_${stamp}.${ext}`;
}

export function imageFileFromClipboard(items: ArrayLike<ClipboardItemLike>, at: Date = new Date()): File | null {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    // 브라우저가 붙이는 이름은 "image.png" 뿐이라 여러 장이 같은 이름으로 쌓인다.
    return new File([file], pastedImageName(file.type || item.type, at), { type: file.type || item.type });
  }
  return null;
}

export function isImageAttachment(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.startsWith("image/");
}
