/** 파일명에 따른 견적서 금액 반영 정책을 한 곳에서 판정한다. */
export function isInternalQuoteFileName(fileName: string): boolean {
  return fileName.includes("내부용");
}
