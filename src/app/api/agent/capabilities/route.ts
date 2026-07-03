import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";

const CAPABILITIES = {
  system: "천우영 ERP",
  version: "1.3.0",
  baseUrl: "/api/agent",
  resources: [
    {
      name: "me",
      description: "연결 테스트 및 Hermes Agent identity 확인",
      endpoints: [
        { method: "GET", path: "/api/agent/me", description: "연결 상태·시스템 정보·agent identity 반환", auth: true, dryRun: false, params: [] },
      ],
    },
    {
      name: "capabilities",
      description: "사용 가능한 API 목록 조회",
      endpoints: [
        { method: "GET", path: "/api/agent/capabilities", description: "이 문서 반환", auth: true, dryRun: false, params: [] },
      ],
    },
    {
      name: "summary",
      description: "ERP 전체 요약 (오늘 출근·대기 휴가·마감 임박·재무)",
      endpoints: [
        { method: "GET", path: "/api/agent/summary", description: "오늘 현황 요약 반환", auth: true, dryRun: false, params: [] },
      ],
    },
    {
      name: "users",
      description: "직원(사용자) 관리",
      read: true, write: false,
      endpoints: [
        {
          method: "GET", path: "/api/agent/users",
          description: "활성 직원 목록 반환 (isAgent 필드 포함)",
          auth: true, dryRun: false,
          params: [
            { name: "q", type: "string", required: false, description: "이름/이메일 검색" },
            { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 50)" },
            { name: "page", type: "number", required: false, description: "페이지 번호 (1부터)" },
          ],
        },
      ],
    },
    {
      name: "projects",
      description: "프로젝트 조회·생성·수정",
      read: true, write: true,
      endpoints: [
        {
          method: "GET", path: "/api/agent/projects",
          description: "프로젝트 목록 반환 (최신 수정순)",
          auth: true, dryRun: false,
          params: [
            { name: "q", type: "string", required: false, description: "프로젝트명/클라이언트 검색" },
            { name: "status", type: "string", required: false, description: "active | completed | on_hold" },
            { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 50, 최대 100)" },
            { name: "page", type: "number", required: false, description: "페이지 번호" },
          ],
        },
        {
          method: "POST", path: "/api/agent/projects",
          description: "프로젝트 생성",
          auth: true, dryRun: true,
          body: {
            name: "string (필수)",
            client: "string (선택)",
            announceDate: "YYYY-MM-DD (선택)",
            deadline: "YYYY-MM-DD (선택)",
            status: "active | completed | on_hold (기본 active)",
            progress: "number 0-100 (기본 0)",
            assignee: "string (선택)",
            memo: "string (선택)",
            revenue: "number (선택)",
            cost: "number (선택)",
            dryRun: "boolean (선택, true면 실제 저장 안 함)",
          },
        },
        {
          method: "PATCH", path: "/api/agent/projects/:id",
          description: "프로젝트 수정",
          auth: true, dryRun: true,
          body: {
            "...": "name, client, announceDate, deadline, status, progress, assignee, memo, revenue, cost 중 수정할 필드만",
            dryRun: "boolean (선택)",
          },
        },
      ],
    },
    {
      name: "attendance",
      description: "근태 기록 조회·Hermes Agent 출퇴근",
      read: true, write: true,
      endpoints: [
        {
          method: "GET", path: "/api/agent/attendance",
          description: "특정 날짜의 전체 직원 출근 현황 반환",
          auth: true, dryRun: false,
          params: [
            { name: "date", type: "YYYY-MM-DD", required: false, description: "없으면 오늘" },
          ],
        },
        {
          method: "GET", path: "/api/agent/attendance/me",
          description: "Hermes Agent 본인의 근태 상태 조회",
          auth: true, dryRun: false,
          params: [
            { name: "date", type: "YYYY-MM-DD", required: false, description: "없으면 오늘" },
          ],
        },
        {
          method: "GET", path: "/api/agent/attendance/logs",
          description: "Hermes Agent 근태 기록 목록 (최신순)",
          auth: true, dryRun: false,
          params: [
            { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 30, 최대 100)" },
            { name: "offset", type: "number", required: false, description: "건너뛸 수 (기본 0)" },
          ],
        },
        {
          method: "POST", path: "/api/agent/attendance/check-in",
          description: "Hermes Agent 출근 기록 (당일 1회)",
          auth: true, dryRun: true,
          body: { dryRun: "boolean (선택)" },
        },
        {
          method: "POST", path: "/api/agent/attendance/check-out",
          description: "Hermes Agent 퇴근 기록 (근무 시간 자동 계산)",
          auth: true, dryRun: true,
          body: { dryRun: "boolean (선택)" },
        },
      ],
    },
    {
      name: "activity-log",
      description: "Hermes Agent 외부 활동 로그 기록",
      read: false, write: true,
      endpoints: [
        {
          method: "POST", path: "/api/agent/activity-log",
          description: "Discord/외부 활동을 ERP에 기록 (AgentAuditLog에 저장)",
          auth: true, dryRun: false,
          body: {
            action: "string (필수) — 활동 설명 (예: discord_command_processed)",
            context: "string (선택) — 컨텍스트 레이블 (예: /discord, /cron)",
            payload: "object (선택) — 요청/입력 데이터",
            result: "object (선택) — 결과 데이터",
          },
        },
      ],
    },
    {
      name: "leave",
      description: "휴가 신청 목록 조회",
      read: true, write: false,
      endpoints: [
        {
          method: "GET", path: "/api/agent/leave",
          description: "휴가 신청 목록 반환",
          auth: true, dryRun: false,
          params: [
            { name: "status", type: "string", required: false, description: "pending | approved | rejected (없으면 전체)" },
            { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 50)" },
            { name: "page", type: "number", required: false, description: "페이지 번호" },
          ],
        },
      ],
    },
    {
      name: "finance",
      description: "재무 현황 조회 (예산·지출·카테고리별)",
      read: true, write: false,
      endpoints: [
        {
          method: "GET", path: "/api/agent/finance",
          description: "특정 년월 재무 현황 반환",
          auth: true, dryRun: false,
          params: [
            { name: "year", type: "number", required: false, description: "없으면 현재 년도" },
            { name: "month", type: "number", required: false, description: "없으면 현재 월" },
          ],
        },
      ],
    },
    {
      name: "calendar",
      description: "캘린더 일정 조회·등록",
      read: true, write: true,
      endpoints: [
        {
          method: "GET", path: "/api/agent/calendar",
          description: "특정 년월 캘린더 이벤트 반환",
          auth: true, dryRun: false,
          params: [
            { name: "year", type: "number", required: false },
            { name: "month", type: "number", required: false },
          ],
        },
        {
          method: "POST", path: "/api/agent/calendar",
          description: "일정 등록 (createdBy 없으면 Hermes Agent 계정 사용)",
          auth: true, dryRun: true,
          body: {
            title: "string (필수)",
            date: "YYYY-MM-DD (필수)",
            endDate: "YYYY-MM-DD (선택)",
            color: "blue | green | red | yellow | purple | gray (기본 blue)",
            createdBy: "userId (선택, 없으면 Hermes Agent)",
            dryRun: "boolean (선택)",
          },
        },
      ],
    },
    {
      name: "messages",
      description: "직원 간 메시지 조회·전송",
      read: true, write: true,
      note: "Hermes 발신 시 isAgent=true 계정을 sender로 사용",
      endpoints: [
        {
          method: "GET", path: "/api/agent/messages",
          description: "두 사용자 사이의 대화 내역 반환",
          auth: true, dryRun: false,
          params: [
            { name: "userId1", type: "string", required: true },
            { name: "userId2", type: "string", required: true },
          ],
        },
        {
          method: "POST", path: "/api/agent/messages",
          description: "Hermes Agent가 직원에게 메시지 전송",
          auth: true, dryRun: true,
          body: {
            recipientUserId: "string (필수)",
            content: "string (필수)",
            dryRun: "boolean (선택)",
          },
        },
      ],
    },
    {
      name: "audit",
      description: "Agent 작업 감사 로그 조회",
      read: true, write: false,
      endpoints: [
        {
          method: "GET", path: "/api/agent/audit",
          description: "최근 Agent 작업 로그 반환 (activity-log 포함)",
          auth: true, dryRun: false,
          params: [
            { name: "limit", type: "number", required: false, description: "기본 20" },
            { name: "dryRun", type: "boolean", required: false, description: "true면 dryRun 로그만" },
          ],
        },
      ],
    },
    {
      name: "sheets",
      description: "Google Sheets 생성·읽기·수정·행 추가 (ERP 서비스 계정 경유, Hermes가 직접 Google 키 불필요)",
      read: true,
      write: true,
      endpoints: [
        {
          method: "GET",
          path: "/api/agent/sheets/folders",
          description: "사용 가능한 Hermes 운영 폴더 alias 목록 반환",
          auth: true,
          dryRun: false,
          params: [],
          response: {
            folders: "{ alias: string, configured: boolean }[]",
            total: "number",
          },
        },
        {
          method: "POST",
          path: "/api/agent/sheets/create",
          description: "새 Google Spreadsheet 생성 (탭 생성·초기 데이터 입력 포함). 생성 후 URL을 Discord에 바로 전달 가능",
          auth: true,
          dryRun: true,
          body: {
            title: "string (필수) — 스프레드시트 제목. 예: \"2026-07-03_디스코드_자료정리\"",
            folder: "string (선택) — Hermes 폴더 alias. GET /api/agent/sheets/folders 로 확인. 예: \"discord\"",
            tabs: "string[] (선택, 기본 [\"Sheet1\"]) — 탭 이름 배열. 최대 10개",
            data: "object (선택) — 탭별 초기 데이터 2D 배열. 예: { \"정리\": [[\"항목\",\"내용\"],[\"A\",\"B\"]] }",
            dryRun: "boolean (선택)",
          },
          response: {
            spreadsheetId: "string",
            url: "string — 편집 URL (Discord에 바로 전달 가능)",
            title: "string",
            folder: "string | null",
            folderMoved: "boolean — 폴더 이동 성공 여부",
            tabs: "string[]",
          },
          example: {
            title: "2026-07-03_디스코드_자료정리",
            folder: "discord",
            tabs: ["정리", "원본"],
            data: {
              "정리": [["항목", "내용", "출처"], ["A", "내용", "링크"]],
              "원본": [["원문"]],
            },
            dryRun: true,
          },
        },
        {
          method: "GET",
          path: "/api/agent/sheets/values",
          description: "지정 시트 범위 읽기. spreadsheetId 없으면 ERP 재무 시트(GOOGLE_SHEET_ID) 사용",
          auth: true,
          dryRun: false,
          params: [
            { name: "spreadsheetId", type: "string", required: false, description: "없으면 GOOGLE_SHEET_ID 기본값" },
            { name: "range", type: "string", required: true, description: "A1 notation. 예: 정리!A1:D20" },
          ],
          response: {
            spreadsheetId: "string",
            range: "string",
            rowCount: "number",
            colCount: "number",
            values: "string[][]",
          },
        },
        {
          method: "POST",
          path: "/api/agent/sheets/values",
          description: "지정 범위 덮어쓰기 (기존 값 대체). spreadsheetId 없으면 ERP 재무 시트 사용",
          auth: true,
          dryRun: true,
          body: {
            spreadsheetId: "string (선택, 없으면 GOOGLE_SHEET_ID)",
            range: "string (필수) — A1 notation. 예: 정리!A1:B2",
            values: "string[][] (필수) — 2D 배열. 최대 500행 × 26열",
            dryRun: "boolean (선택)",
          },
        },
        {
          method: "POST",
          path: "/api/agent/sheets/append",
          description: "마지막 행 이후에 행 추가 (기존 데이터 유지). spreadsheetId 없으면 ERP 재무 시트 사용",
          auth: true,
          dryRun: true,
          body: {
            spreadsheetId: "string (선택, 없으면 GOOGLE_SHEET_ID)",
            range: "string (필수) — 열 범위. 예: 정리!A:D",
            values: "string[][] (필수) — 추가할 행들. 최대 500행",
            dryRun: "boolean (선택)",
          },
          response: {
            tableRange: "string — 기존 데이터 범위",
            updatedRange: "string — 실제 추가된 범위",
            updatedRows: "number",
            updatedCells: "number",
          },
        },
      ],
      limits: {
        maxReadRows: 1000,
        maxWriteRows: 500,
        maxCols: 26,
        maxTabs: 10,
        maxTitleLen: 100,
        maxInitialCells: 13000,
      },
      notes: [
        "서비스 계정(erp-sheet@navercafe-data.iam.gserviceaccount.com)이 해당 시트에 편집 권한이 있어야 합니다.",
        "폴더 기능: Google Drive 폴더를 서비스 계정과 공유(편집자) 후 Render env에 GOOGLE_DRIVE_HERMES_*_FOLDER_ID를 등록하세요.",
        "folder 없이 create 호출 시 서비스 계정의 Drive에 생성됩니다 — 직접 접근하려면 폴더를 설정하거나 URL로 접근하세요.",
        "spreadsheetId 없이 values/append 호출 시 GOOGLE_SHEET_ID(ERP 재무 시트)에 쓰게 됩니다 — 의도한 시트인지 확인하세요.",
      ],
    },
    {
      name: "webhook",
      description: "ERP → Hermes 웹훅 (메신저 키워드 감지 시 자동 발송)",
      note: [
        "ERP 메신저에서 '헤르메스', '@헤르메스', 'hermes', '@hermes' 포함 메시지 전송 시 자동 발송",
        "서버가 HERMES_WEBHOOK_URL, HERMES_WEBHOOK_SECRET 환경변수를 보유해야 함",
        "서명: X-Hermes-Signature: sha256=HMAC-SHA256(secret, timestamp + '.' + body)",
        "타임스탬프: X-Hermes-Timestamp (Unix ms)",
        "웹훅 실패는 메시지 저장을 블록하지 않음 (fire-and-forget, 5초 timeout)",
        "secret 값은 절대 응답에 포함되지 않음",
      ],
      endpoints: [
        {
          method: "POST", path: "/api/agent/webhook-test",
          description: "웹훅 연결 테스트 (실제 webhook URL로 테스트 페이로드 발송)",
          auth: true, dryRun: false,
          body: {},
          response: {
            ok: "boolean — 웹훅 수신 성공 여부",
            status: "number — HTTP 응답 코드",
            latencyMs: "number — 응답 시간(ms)",
            configured: {
              hasWebhookUrl: "boolean",
              hasSecret: "boolean",
            },
          },
        },
      ],
      webhookPayload: {
        event: "messenger.mention | webhook.test",
        senderId: "string — ERP 사용자 ID",
        senderName: "string | undefined — ERP 사용자 이름",
        conversationId: "string — 대화 ID",
        content: "string — 메시지 원문",
        timestamp: "ISO 8601 timestamp",
      },
    },
  ],
};

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(CAPABILITIES);
}
