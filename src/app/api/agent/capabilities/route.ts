import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";

const CAPABILITIES = {
  system: "천우영 ERP",
  version: "2.0.0",
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
          description: "활성 직원 목록 반환 (isAgent, agentType 필드 포함)",
          auth: true, dryRun: false,
          params: [
            { name: "q", type: "string", required: false, description: "이름/이메일 검색" },
            { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 50)" },
            { name: "page", type: "number", required: false, description: "페이지 번호 (1부터)" },
          ],
          responseFields: "id, email, name, role, isAgent, agentType, active, createdAt",
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
      description: "직원 간 메시지 조회·전송·pending 조회·claim·ack",
      read: true, write: true,
      operationMode: "webhook (Hermes) 또는 polling (마케터) 모두 지원",
      note: "agentType 지정 시 해당 에이전트 계정을 sender로 사용. 미지정 시 Hermes(기본)",
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
          description: "에이전트가 직원에게 메시지 전송. agentType으로 발신자 계정 선택",
          auth: true, dryRun: true,
          body: {
            agentType: "\"hermes\" | \"marketer\" (선택, 기본 hermes) — sender 계정 결정",
            recipientUserId: "string (conversationId 없을 때 필수) — 수신자 userId",
            conversationId: "string (선택) — 대화 ID 직접 지정. pending에서 받은 conversationId를 그대로 사용해 답장",
            content: "string (필수)",
            dryRun: "boolean (선택)",
          },
          note: "conversationId와 recipientUserId 중 하나 필수. conversationId가 주어지면 그대로 사용(참여자 검증 없음). pending의 conversationId를 신뢰하고 그대로 전달할 것.",
        },
        {
          method: "GET", path: "/api/agent/messages/pending",
          description: "에이전트 대상 미처리 메시지 목록 반환 (polling 방식). agentType별 엄격히 분리",
          auth: true, dryRun: false,
          params: [
            { name: "agentType", type: "\"hermes\" | \"marketer\"", required: true, description: "조회할 에이전트 타입" },
            { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 20, 최대 50)" },
          ],
          response: {
            agentType: "string",
            count: "number",
            messages: "{ messageId, conversationId, senderUserId, senderName, replyRecipientId, content, agentType, createdAt }[]",
          },
          rules: [
            "이 에이전트의 1:1 대화방(participantA/B = 에이전트 ID) 내 메시지는 키워드 없이도 포함",
            "다른 에이전트의 전용 1:1 대화방 내 메시지는 키워드 있어도 제외 (대화 완전 분리)",
            "그 외 대화방(단체방 등)은 키워드 기반 라우팅 (@마케터/마케터/marketer/@marketer 등)",
            "에이전트 자신이 보낸 메시지는 제외",
            "status=processing 또는 processed 메시지는 제외 (claim 중 포함)",
            "최근 7일 기준 스캔",
          ],
          replyNote: "반환된 conversationId는 에이전트 1:1 대화방의 정확한 ID. POST /api/agent/messages에 그대로 전달할 것.",
        },
        {
          method: "POST", path: "/api/agent/messages/:id/claim",
          description: "메시지 처리 시작 전 원자적으로 claim. 중복 처리 방지용. 이미 처리 중/완료인 경우 claimed: false 반환",
          auth: true, dryRun: false,
          body: {
            agentType: "\"hermes\" | \"marketer\" (필수)",
          },
          response: {
            claimed: "true → 처리 시작 가능 / false → 다른 인스턴스가 이미 처리 중",
            record: "{ id, messageId, agentType, status: \"processing\", createdAt } — claimed=true일 때",
            existing: "{ status, createdAt } — claimed=false일 때 기존 레코드 정보",
          },
          note: "처리 실패 시 POST /api/agent/messages/:id/ack { status: \"error\" } 로 claim 해제 → 다음 polling에서 재처리 가능",
        },
        {
          method: "POST", path: "/api/agent/messages/:id/ack",
          description: "메시지 처리 완료/실패 기록. processing → processed 전환 또는 claim 해제(error)",
          auth: true, dryRun: false,
          body: {
            agentType: "\"hermes\" | \"marketer\" (필수)",
            status: "\"processed\" | \"error\" (기본 processed)",
            resultMessageId: "string (선택) — 답장으로 보낸 messageId",
            error: "string (선택) — status=error일 때 오류 내용",
          },
          response: {
            ok: "true → 신규 처리 완료 또는 processing→processed 전환",
            released: "true → error로 claim 해제됨 (다음 polling에서 재처리 가능)",
            alreadyProcessed: "true → 이미 processed 상태인 경우",
            record: "{ id, messageId, agentType, status, processedAt, resultMessageId }",
          },
        },
      ],
      pollingFlow: [
        "1. GET /api/agent/messages/pending?agentType=marketer → 미처리 메시지 목록 (1:1 대화방 포함)",
        "2. 각 메시지별: POST /api/agent/messages/:id/claim { agentType } → claimed:true면 처리, false면 스킵 (중복 방지)",
        "3. AI 응답 생성",
        "4. POST /api/agent/messages { agentType: marketer, conversationId: <pending에서 받은 값 그대로>, content } → ERP 메신저 답장",
        "5. POST /api/agent/messages/:id/ack { agentType: marketer, status: processed, resultMessageId } → 처리 완료",
        "   실패 시: POST ack { status: error } → claim 해제, 다음 polling에서 재처리",
        "6. 주기적으로 1번부터 반복",
      ],
      agentTypeSeparation: {
        marketer: "마케터 1:1 대화방 메시지 + 단체방에서 @마케터 키워드. 헤르메스 전용 대화방 완전 제외",
        hermes: "헤르메스 1:1 대화방 메시지 + 단체방에서 @헤르메스 키워드. 마케터 전용 대화방 완전 제외",
      },
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
            root: "string — 최상위 폴더명 (Hermes 운영 시트)",
            rootFolderConfigured: "boolean — env에 루트 폴더 ID 설정 여부",
            agentDefaults: "{ agentType, subfolder, folderPath }[] — agentType별 기본 폴더 경로",
          },
        },
        {
          method: "POST",
          path: "/api/agent/sheets/create",
          description: "새 Google Spreadsheet 생성. 폴더 없으면 자동 생성. URL을 Discord에 바로 전달 가능",
          auth: true,
          dryRun: true,
          body: {
            agentType: "\"hermes\" | \"marketer\" | \"report\" (선택, 기본 hermes) — 기본 폴더 결정에 사용",
            folderName: "string (선택) — 직접 폴더명 지정. 예: \"ERP\" → Hermes 운영 시트/ERP",
            title: "string (선택) — 시트 제목. 없으면 sourcePrompt에서 자동 생성",
            sourcePrompt: "string (선택) — title 없을 때 제목 생성용 원문",
            tabs: "string[] (선택, 기본 [\"Sheet1\"]) — 탭 이름 배열. 최대 10개",
            data: "object (선택) — 탭별 초기 데이터 2D 배열. 예: { \"정리\": [[\"항목\",\"내용\"]] }",
            dryRun: "boolean (선택) — true면 title·folderPath preview만 반환, 실제 생성 안 함",
          },
          response: {
            spreadsheetId: "string",
            url: "string — 편집 URL (Discord에 바로 전달 가능)",
            title: "string",
            folderPath: "string — 예: Hermes 운영 시트/Hermes",
          },
          folderLogic: {
            "folderName 없음 + agentType=hermes": "Hermes 운영 시트/Hermes",
            "folderName 없음 + agentType=marketer": "Hermes 운영 시트/마케터",
            "folderName 없음 + agentType=report": "Hermes 운영 시트/보고서",
            "folderName=ERP": "Hermes 운영 시트/ERP",
            "폴더 없으면": "자동 생성",
          },
          example: {
            agentType: "hermes",
            folderName: "ERP",
            sourcePrompt: "사용자 요청: ERP 관련 자료 정리",
            tabs: ["정리", "원본"],
            data: {
              "정리": [["항목", "내용", "출처"], ["A", "내용", "링크"]],
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
            { name: "spreadsheetUrl", type: "string", required: false, description: "Google Sheets URL (spreadsheetId 대신 사용 가능). gid 포함 시 parsedGid 반환" },
            { name: "range", type: "string", required: true, description: "A1 notation. 예: 정리!A1:D20" },
          ],
          response: {
            spreadsheetId: "string",
            parsedGid: "string | undefined — URL에 gid 포함 시만 반환",
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
            spreadsheetUrl: "string (선택) — Google Sheets URL. spreadsheetId 대신 사용 가능",
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
            spreadsheetUrl: "string (선택) — Google Sheets URL. spreadsheetId 대신 사용 가능",
            range: "string (선택, 기본 A1) — 열 범위. 예: 정리!A:D. 없으면 첫 번째 시트 A1부터 자동 탐색",
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
        {
          method: "POST",
          path: "/api/agent/sheets/format",
          description: "셀 서식 일괄 적용 (배경색·글자색·굵게·테두리·체크박스 등). Sheets API batchUpdate 사용",
          auth: true,
          dryRun: true,
          body: {
            spreadsheetId: "string (선택) — 없으면 spreadsheetUrl 필수",
            spreadsheetUrl: "string (선택) — Google Sheets URL",
            requests: `FormatRequest[] (필수, 최대 50개) — 각 요소:
  {
    range: string (필수) — A1 notation. 예: "Sheet1!A1:C3", "A1", "시트!B:D"
    backgroundColor?: string | {red,green,blue} — 배경색. "#FF0000" 또는 {red:1,green:0,blue:0} (0-1)
    textColor?: string | {red,green,blue} — 글자색
    bold?: boolean — 굵게
    italic?: boolean — 기울임
    strikethrough?: boolean — 취소선
    underline?: boolean — 밑줄
    fontSize?: number — 글자 크기 (pt)
    horizontalAlignment?: "LEFT" | "CENTER" | "RIGHT"
    verticalAlignment?: "TOP" | "MIDDLE" | "BOTTOM"
    wrapStrategy?: "OVERFLOW_CELL" | "CLIP" | "WRAP"
    borders?: {
      top? bottom? left? right? innerHorizontal? innerVertical?: "SOLID" | "SOLID_MEDIUM" | "SOLID_THICK" | "DOTTED" | "DASHED" | "DOUBLE" | "NONE"
      color?: string | {red,green,blue} — 테두리 색상 (기본 검정)
    }
    checkbox?: boolean — true=체크박스 추가, false=체크박스 제거
  }`,
            dryRun: "boolean (선택) — true면 parsedRange·operations preview만 반환",
          },
          response: {
            ok: "true — 성공",
            spreadsheetId: "string",
            appliedRequests: "number — 입력 요청 수",
            apiRequestCount: "number — 실제 Sheets API 호출 수 (repeatCell + updateBorders + setDataValidation 합산)",
          },
          notes: [
            "fields mask를 동적으로 구성하므로 지정하지 않은 서식은 기존 값 유지",
            "테두리 color 미지정 시 기본값 검정 (#000000)",
            "checkbox: false는 해당 범위의 데이터 유효성 검사(드롭다운 포함) 모두 제거",
            "시트명 미지정 시 첫 번째 탭에 적용",
            "서비스 계정이 해당 시트에 편집 권한이 있어야 함",
          ],
          examples: [
            {
              description: "헤더 행 배경색 파란색 + 흰색 글자 + 굵게 + 전체 테두리",
              body: {
                spreadsheetId: "1BxiMVs...",
                requests: [{
                  range: "Sheet1!A1:E1",
                  backgroundColor: "#1565C0",
                  textColor: "#FFFFFF",
                  bold: true,
                  borders: { top: "SOLID", bottom: "SOLID", left: "SOLID", right: "SOLID", innerVertical: "SOLID" },
                }],
              },
            },
            {
              description: "A열 체크박스 추가",
              body: {
                spreadsheetId: "1BxiMVs...",
                requests: [{ range: "시트1!A2:A20", checkbox: true }],
              },
            },
          ],
        },
        {
          method: "POST",
          path: "/api/agent/sheets/add-sheet",
          description: "스프레드시트에 새 탭(시트) 추가. 동일 제목 탭 이미 존재 시 에러 없이 { created: false, exists: true } 반환",
          auth: true,
          dryRun: true,
          body: {
            spreadsheetId: "string (선택) — 없으면 spreadsheetUrl 필수",
            spreadsheetUrl: "string (선택) — Google Sheets URL",
            title: "string (필수) — 새 탭 이름. 최대 100자. \\, /, *, ?, :, [, ] 불가",
            dryRun: "boolean (선택) — true면 기존 탭 목록만 확인하고 실제 생성 안 함",
          },
          response: {
            ok: "true",
            created: "boolean — 새 탭 생성됨 (true) / 이미 존재 (false)",
            exists: "boolean — 동일 제목 탭이 이미 존재할 때 true",
            spreadsheetId: "string",
            sheetTitle: "string — 실제 생성된 탭 이름",
            sheetId: "number — Google Sheets 내부 탭 ID",
          },
          example: {
            request: {
              spreadsheetId: "1QgjdAxHr7U4J5eBB9FuBaRsifdesVu_eztV_3Hp8no4",
              title: "해외_Behance_분리",
              dryRun: false,
            },
            response: {
              ok: true,
              created: true,
              spreadsheetId: "1QgjdAxHr7U4J5eBB9FuBaRsifdesVu_eztV_3Hp8no4",
              sheetTitle: "해외_Behance_분리",
              sheetId: 123456789,
            },
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
        "폴더 기능: Google Drive 폴더를 서비스 계정과 공유(편집자) 후 Render env에 GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID를 등록하세요.",
        "spreadsheetId 없이 values/append 호출 시 GOOGLE_SHEET_ID(ERP 재무 시트)에 쓰게 됩니다 — 의도한 시트인지 확인하세요.",
        "spreadsheetUrl 허용 도메인: docs.google.com/spreadsheets — 다른 도메인은 400 오류.",
        "전형적인 Hermes 흐름: find로 spreadsheetId 검색 → values로 읽기 → append로 행 추가",
        "URL 흐름: 사용자가 준 Sheets 링크 → spreadsheetUrl로 바로 전달 → 서버가 ID 추출",
      ],
      driveSearch: {
        description: "Google Drive 폴더 안의 스프레드시트를 조회/검색하는 엔드포인트",
        endpoints: [
          {
            method: "GET",
            path: "/api/agent/sheets/folder-files",
            description: "폴더 안의 Google Spreadsheet 목록 반환. folderId/folderUrl 없으면 root(Hermes 운영 시트) 사용",
            auth: true,
            params: [
              { name: "folderId", type: "string", required: false, description: "Google Drive 폴더 ID. 없으면 root 폴더 사용" },
              { name: "folderUrl", type: "string", required: false, description: "Google Drive 폴더 URL. folderId보다 우선순위 낮음. 예: https://drive.google.com/drive/folders/1aYyO3..." },
              { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 50, 최대 100)" },
            ],
            response: {
              folderId: "string",
              isRootFolder: "boolean",
              count: "number",
              files: "{ name, spreadsheetId, url, modifiedTime, parentFolderId }[]",
            },
            example: "GET /api/agent/sheets/folder-files (파라미터 없이 → root 폴더 목록)",
            security: "root 폴더 또는 직계 하위 폴더만 허용. 외부 폴더는 403 반환",
          },
          {
            method: "GET",
            path: "/api/agent/sheets/find",
            description: "폴더 안에서 시트 이름으로 검색. 대소문자·공백 차이 무시. bestMatch로 가장 유사한 결과 반환",
            auth: true,
            params: [
              { name: "q", type: "string", required: true, description: "검색어 (시트 이름 일부). 예: 고객리스트" },
              { name: "folderId", type: "string", required: false, description: "검색할 폴더 ID. 없으면 root 폴더" },
              { name: "folderUrl", type: "string", required: false, description: "검색할 폴더 URL" },
              { name: "limit", type: "number", required: false, description: "최대 반환 수 (기본 10, 최대 50)" },
            ],
            response: {
              q: "string — 검색어",
              folderId: "string",
              totalScanned: "number — 전체 스캔 파일 수",
              matchCount: "number",
              matches: "{ name, spreadsheetId, url, modifiedTime }[]",
              bestMatch: "{ name, spreadsheetId, url, modifiedTime } | null",
            },
            example: "GET /api/agent/sheets/find?q=고객리스트",
          },
        ],
        typicalFlow: [
          "1. GET /api/agent/sheets/find?q=시트이름 → bestMatch.spreadsheetId 획득",
          "2. GET /api/agent/sheets/values?spreadsheetId=...&range=A1:D10 → 내용 읽기",
          "3. POST /api/agent/sheets/append { spreadsheetId, range, values } → 행 추가",
        ],
      },
      enrichRestaurants: {
        description: "식당/업체 후보 시트의 '확인 필요' 전화번호를 네이버 Local API로 자동 보강",
        endpoint: {
          method: "POST",
          path: "/api/agent/sheets/enrich-restaurants",
          auth: true,
          dryRun: true,
          body: {
            spreadsheetId: "string (선택) — 없으면 spreadsheetUrl 필수",
            spreadsheetUrl: "string (선택) — Google Sheets URL",
            sheetName: "string (선택) — 탭 이름. 예: 신규후보_기존제외. 없으면 첫 번째 탭",
            limit: "number (선택, 기본 20, 최대 50) — 처리할 최대 행 수",
            dryRun: "boolean (선택) — true면 시트 수정 없이 preview만 반환",
          },
          response: {
            ok: "true",
            scanned: "number — 전체 데이터 행 수",
            targets: "number — 보강 대상 행 수 (전화번호 '확인 필요' 행)",
            enriched: "number — 실제 전화번호 보강 완료 행 수",
            detectedColumns: "{ name, phone, address, status } — 감지된 컬럼 위치",
            results: "RowResult[] — 행별 처리 결과",
          },
          rowResult: {
            rowNum: "number — 시트 행 번호",
            name: "string — 식당명",
            originalPhone: "string — 기존 전화번호 값",
            action: "\"updated\" | \"multiple_candidates\" | \"no_phone_found\" | \"no_match\" | \"api_error\" | \"skip\"",
            newPhone: "string? — 보강된 전화번호 (action=updated)",
            newStatus: "string? — 검증 상태 텍스트",
            matchedTitle: "string? — 매칭된 네이버 상호명",
            naverTotal: "number? — 네이버 검색 결과 수",
          },
          columnDetection: [
            "식당명/상호명/업체명/가게명 → 이름 컬럼",
            "전화번호/연락처/전화 → 전화번호 컬럼 (기존값 있으면 절대 덮어쓰지 않음)",
            "도로명주소 우선, 없으면 주소 → 주소 컬럼 (검색 쿼리 보강용)",
            "확인상태/검증상태/비고/상태/메모 → 상태 컬럼 (선택)",
          ],
          matchingRules: [
            "이름 exact match → 단독 결과면 confident 처리",
            "이름 포함 관계(2자 이상) + 주소 토큰 1개 이상 겹침 → confident",
            "confident 결과 2개 이상 → '후보 다수 / 확인 필요'로 상태 기록",
            "전화번호 있는 결과만 보강. 매칭돼도 전화번호 없으면 no_phone_found",
            "기존 전화번호가 '확인 필요'·'-'·비어있음이 아니면 skip",
          ],
          statusValues: {
            "네이버 Local API 확인": "단일 confident 매칭 + 전화번호 보강 완료",
            "후보 다수 / 확인 필요": "confident 후보가 2개 이상 (수동 확인 필요)",
          },
        },
        example: {
          request: {
            spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1M9ss1ui.../edit",
            sheetName: "신규후보_기존제외",
            limit: 20,
            dryRun: true,
          },
        },
      },
    },
    {
      name: "search",
      description: "외부 검색 API 연동 (현재: 네이버 지역 검색)",
      endpoints: [
        {
          method: "GET",
          path: "/api/agent/search/naver/local",
          description: "네이버 Local Search API — 상호명·주소·전화번호·카테고리 반환. 식당/업체 전화번호 확인에 활용",
          auth: true,
          dryRun: false,
          params: [
            { name: "q", type: "string", required: true, description: "검색어. 예: '막창도둑 성남복정점' 또는 '막창도둑 성남시'" },
            { name: "display", type: "number", required: false, description: "결과 수 (기본 5, 최대 5 — Naver API 제한)" },
          ],
          response: {
            query: "string — 실제 검색어",
            display: "number",
            total: "number — 전체 검색 결과 수",
            items: `{
  title: string — 상호명 (<b> 태그 제거됨)
  category: string — 업종 카테고리
  telephone: string — 전화번호 (없으면 빈 문자열)
  address: string — 지번 주소
  roadAddress: string — 도로명 주소
  mapx: string — X 좌표
  mapy: string — Y 좌표
  link: string — 네이버 지도 링크
}[]`,
          },
          security: "NAVER_CLIENT_SECRET은 응답·로그에 절대 포함되지 않음",
          notes: [
            "Naver Local API display 최대: 5 (API 자체 제한)",
            "정확도를 위해 상호명 + 지역명을 함께 검색 권장. 예: '막창도둑 성남복정점 성남'",
            "telephone이 빈 문자열인 결과도 반환될 수 있음 (업체가 전화번호 미등록)",
          ],
          example: "GET /api/agent/search/naver/local?q=막창도둑 성남복정점&display=3",
        },
      ],
      typicalFlow: [
        "1. GET /api/agent/search/naver/local?q={식당명} {지역} → items[0].telephone 확인",
        "2. title이 식당명과 일치하고 address/roadAddress가 지역과 겹치면 telephone 사용",
        "3. 여러 결과이면 address로 추가 구분 후 수동 확인 권장",
        "4. 시트 대량 보강: POST /api/agent/sheets/enrich-restaurants (자동화)",
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
        agentType: "\"hermes\" | \"marketer\" — 멘션된 에이전트 타입",
        senderId: "string — ERP 사용자 ID",
        senderName: "string | undefined — ERP 사용자 이름",
        conversationId: "string — 대화 ID",
        content: "string — 메시지 원문",
        timestamp: "ISO 8601 timestamp",
      },
      mentionRouting: {
        "헤르메스 | @헤르메스 | hermes | @hermes": "agentType: \"hermes\" → HERMES_WEBHOOK_URL 발송",
        "마케터 | @마케터 | marketer | @marketer": "agentType: \"marketer\" → MARKETER_WEBHOOK_URL 발송 (미설정 시 HERMES_WEBHOOK_URL fallback)",
        "우선순위": "marketer > hermes (동시 포함 시 marketer로 라우팅)",
        "secret": "agentType=marketer → MARKETER_WEBHOOK_SECRET (미설정 시 HERMES_WEBHOOK_SECRET fallback)",
      },
    },
    {
      name: "multi-agent",
      description: "다중 에이전트 구성 (Hermes + 마케터)",
      agents: [
        {
          agentType: "hermes",
          name: "헤르메스",
          email: "ybsw1220@gmail.com",
          keywords: ["헤르메스", "@헤르메스", "hermes", "@hermes"],
          isAgent: true,
        },
        {
          agentType: "marketer",
          name: "마케터",
          email: "marketer-agent@local.erp",
          keywords: ["마케터", "@마케터", "marketer", "@marketer"],
          isAgent: true,
        },
      ],
      routing: "ERP 메신저에서 키워드 감지 시 웹훅 payload.agentType으로 수신 에이전트 구분. 동일 webhook URL 사용 권장",
      verify: "GET /api/agent/users → isAgent: true 레코드 2개 확인 (agentType: hermes, marketer)",
    },
  ],
};

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(CAPABILITIES);
}
