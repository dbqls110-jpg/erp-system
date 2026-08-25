/**
 * 첨부 파일을 이름으로 분류한다.
 *
 * Drive 저장 경로: 천우영 시스템 > {년월} > {프로젝트명} > {분류}
 * 분류에 실패하면 프로젝트 폴더에 그대로 둔다(하위 폴더 없음). 나중에 파일 내용을
 * 읽어 판정하는 단계가 붙으면, 미분류로 남은 것들만 정리하면 된다.
 */

export interface FileCategory {
  /** Drive 하위 폴더명 */
  folder: string;
  /** 파일명에 이 중 하나가 들어가면 해당 분류로 본다 */
  keywords: string[];
}

export const FILE_CATEGORIES: FileCategory[] = [
  { folder: "견적서", keywords: ["견적서", "견적", "quotation", "quote", "estimate"] },
  { folder: "계약서", keywords: ["계약서", "계약", "contract", "agreement"] },
  { folder: "포스터", keywords: ["포스터", "poster"] },
  { folder: "제안서", keywords: ["제안서", "제안", "proposal"] },
  { folder: "정산서", keywords: ["정산서", "정산", "settlement", "invoice", "청구"] },
  { folder: "기획안", keywords: ["기획안", "기획", "plan"] },
  { folder: "도면", keywords: ["도면", "배치도", "레이아웃", "layout", "floorplan"] },
  { folder: "사진", keywords: ["사진", "현장", "photo"] },
];

/**
 * 파일명에서 분류 폴더를 찾는다. 못 찾으면 null.
 *
 * 확장자를 떼고 소문자로 맞춰 비교한다. 여러 분류에 걸리면 먼저 선언된 쪽을 쓴다
 * (예: "견적서_계약서.pdf" → 견적서).
 */
export function categorizeFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  for (const cat of FILE_CATEGORIES) {
    if (cat.keywords.some((k) => base.includes(k.toLowerCase()))) {
      return cat.folder;
    }
  }
  return null;
}
