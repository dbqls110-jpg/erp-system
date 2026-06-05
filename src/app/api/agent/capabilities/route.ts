import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";

const CAPABILITIES = {
  system: "천우영 ERP",
  version: "1.1.0",
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
  ],
};

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(CAPABILITIES);
}
