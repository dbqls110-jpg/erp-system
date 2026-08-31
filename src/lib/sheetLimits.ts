/**
 * 시트 생성 경로가 함께 쓰는 제한값이다. 라우트와 메신저가 서로 다른 제한을
 * 적용하면 미리보기와 실제 생성 결과가 달라지므로 한 곳에 둔다.
 */
export const LIMITS = {
  MAX_READ_ROWS: 1000,
  MAX_WRITE_ROWS: 500,
  MAX_COLS: 26,
  MAX_TABS: 10,
  MAX_TITLE_LEN: 100,
  MAX_INITIAL_CELLS: 13000,
  MAX_CELL_LEN: 500,
} as const;

export const SHEET_ROOT_FOLDER_NAME = "Hermes 운영 시트";

// 기존 시트 생성 API가 쓰던 에이전트별 폴더 이름을 그대로 유지한다.
export const SHEET_AGENT_FOLDER_MAP: Record<string, string> = {
  "agent-1": "Hermes",
  "agent-2": "마케터",
  hermes: "Hermes",
  marketer: "마케터",
  report: "보고서",
};

export const SHEET_ALLOWED_AGENT_TYPES = ["agent-1", "agent-2", "hermes", "marketer"] as const;
export const SHEET_DEFAULT_AGENT_TYPE = "agent-1";
export const SHEET_DEFAULT_FOLDER_NAME = SHEET_AGENT_FOLDER_MAP[SHEET_DEFAULT_AGENT_TYPE];

export function sanitizeSheetTitle(raw: string, maxLen: number = LIMITS.MAX_TITLE_LEN): string {
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trim();
}

export function sheetFolderPath(folderName?: string, agentType: string = SHEET_DEFAULT_AGENT_TYPE): string {
  const subfolder = folderName || SHEET_AGENT_FOLDER_MAP[agentType] || SHEET_DEFAULT_FOLDER_NAME;
  return `${SHEET_ROOT_FOLDER_NAME}/${subfolder}`;
}
