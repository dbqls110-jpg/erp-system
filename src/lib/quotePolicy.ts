/** 파일명에 따른 견적서 금액 반영 정책을 한 곳에서 판정한다. */
export function isInternalQuoteFileName(fileName: string): boolean {
  return fileName.includes("내부용");
}

export function getProjectQuoteKind(fileName: string): "revenue" | "cost" | "internal" | null {
  const name = fileName.normalize("NFKC");
  const revenue = name.includes("매출");
  const cost = name.includes("매입");
  if (revenue !== cost) return revenue ? "revenue" : "cost";
  return isInternalQuoteFileName(name) ? "internal" : null;
}

/** Explicitly separated quotations take precedence over a combined internal quote. */
export function firstInternalQuote<T extends { name: string }>(files: T[]): T | null {
  if (files.some(file => {
    const kind = getProjectQuoteKind(file.name);
    return kind === "revenue" || kind === "cost";
  })) return null;
  return files.find(file => getProjectQuoteKind(file.name) === "internal") ?? null;
}
