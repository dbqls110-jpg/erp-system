# 인수인계 — ERP 시스템

**작성 시점: 2026-08-18 (KST). 이 문서는 2026-08-11 판을 대체합니다.**
아래 "라이브 상태"는 2026-08-18 저녁에 실제로 DB와 코드를 조회해 확인한 값입니다. **시간이 지나면 낡으니 반드시 다시 확인하고 판단하세요.** 확인 명령은 각 항목에 적어뒀습니다.

## 프로젝트 개요

Next.js 16 + Prisma 7 + PostgreSQL(Supabase) 기반 사내 ERP. 근태/휴가/재무/메신저/캘린더/명함 관리 + "헤르메스"·"마케터" AI 에이전트가 메신저로 직원과 대화하는 기능.

- 저장소: `dbqls110-jpg/erp-system`, `main` 브랜치
- 배포: Render(`erp-system-lojo.onrender.com`), `main` 푸시 시 자동배포
- **로컬 경로: `C:\dev\erp 시스템\erp-system`** (예전 `OneDrive\Desktop\erp 시스템`에서 이동됨)
- 빌드 명령: `npm run render-build` = `prisma generate && prisma migrate deploy && next build`

## 지금 당장 알아야 할 것 (함정 3가지)

1. **`git pull` 직후엔 반드시 `npx prisma generate`를 먼저 실행하세요.** 안 하면 `src/lib/driveIndex.ts`에서 "Property 'driveIndexFolder' does not exist on type 'PrismaClient'" 류의 타입 에러가 15개쯤 쏟아집니다. 코드 버그가 아니라 Prisma 클라이언트가 신규 모델을 아직 모르는 것뿐입니다.

2. **`npx prisma migrate status`가 `20260722141000_add_drive_search_index`를 "미적용"으로 표시하지만, 실제 테이블 3개(`drive_index_folders/files/chunks`)는 DB에 이미 존재합니다.** `src/lib/driveIndex.ts`의 `ensureDriveIndexSchema()`가 런타임에 `CREATE TABLE IF NOT EXISTS`로 만들어놨기 때문입니다. 마이그레이션 SQL도 전부 `IF NOT EXISTS`라 **다음 Render 배포 때 자동으로 적용·기록되고 깨지지 않습니다.** 이 상태를 보고 "마이그레이션이 실패했다"고 오판하지 마세요. 수동 조치 불필요.

3. **브릿지가 지금 둘 다 오프라인이라 메신저는 구형 폴링 경로로 폴백 중입니다.** 신규 `agent_jobs`/SSE 경로를 테스트하려면 브릿지부터 켜야 합니다.

## 라이브 상태 (2026-08-18 저녁 확인)

### 코드 품질 — 전부 실제 실행해서 확인함

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | 에러 0 |
| `npm test` (vitest) | 9개 파일 / 64개 테스트 전부 통과 |
| `npm run build` | 성공 |
| `npx eslint src` | 에러 3, 경고 5 — **전부 기존 문제**(아래 참고) |

기존 lint 에러 3건(이번에 손대지 않음):
- `src/app/(app)/messenger/MessengerView.tsx:212, :221` — `react-hooks/set-state-in-effect`. 비동기 fetch 후 setState라 사실상 오탐이지만, 고치려면 MessengerView 폴링 구조를 건드려야 해서 보류함.
- `src/__tests__/renderBuild.test.ts:15` — `no-explicit-any`.

### DB (Supabase, us-east-1 session pooler)

- 마이그레이션: 저장소 17개 중 16개 기록됨. 나머지 1개는 위 "함정 2" 참고.
- 확인: `npx prisma migrate status`

### 브릿지 하트비트

| 에이전트 | 호스트 | 보고 버전 | 마지막 하트비트 | 상태 |
|---|---|---|---|---|
| hermes | DESKTOP-7H5PRQA (회사 PC) | 2.2.0 | 2026-08-17T22:24Z (=08-18 07:24 KST) | **오프라인** |
| marketer | soyu (노트북) | 2.0.0 | 2026-07-25T06:59Z | **오프라인** |

- 온라인 판정 기준은 60초 이내 하트비트(`src/app/actions/message.ts`의 `isBridgeOnline()`).
- 저장소의 `agent_bridge/client.py`는 `VERSION = "2.2.0"`. 헤르메스는 2.2.0으로 일치 — **예전 인수인계 문서의 "버전 불일치" 이슈는 해결됨.** 마케터가 2.0.0으로 보고하는 건 7/25에 구버전으로 돌던 마지막 기록일 뿐이고, 지금 재시작하면 2.2.0으로 뜹니다.
- 브릿지 켜기: `agent_bridge\check_marketer.cmd`(사전점검) → `agent_bridge\start_marketer.cmd`

## 2026-08-18 작업 내용: 백그라운드 폴링 하자 수정

**문제:** 클라이언트 폴러가 탭 가시성을 확인하지 않고 계속 돌아, 아무도 안 보는 백그라운드 탭이 DB를 하루 종일 깨워놨음. Neon 무료 플랜 컴퓨트 시간 소진(→ Supabase 이전) 사고의 근본 원인. Supabase에서도 같은 식으로 재발할 수 있어 정리함.

가장 심한 건 `Header.tsx`였음 — `AppShell`을 통해 **모든 인증 페이지에 항상 마운트**되는데, 30초마다 `/api/messenger/unread`를 호출하고 이 라우트는 **호출당 DB 쿼리를 2번** 함(대화 목록 조회 + 안읽음 카운트). 탭 하나만 열어둬도 하루 2,880회 × 2쿼리.

**신규 파일 `src/lib/useVisiblePolling.ts`** — 공용 훅. **탭이 보이는 동안에만 폴링**하고, **탭으로 돌아오는 순간 즉시 1회 갱신**합니다(`AutoRefresh.tsx`가 이미 쓰던 방식). `immediate` 옵션의 1회 실행은 "사용자가 화면을 연 시점"이므로 가시성 제한을 받지 않습니다.

설계상 중요한 두 가지:

- **콜백은 ref로 보관합니다.** 즉시 실행 effect의 deps에 `callback`을 넣으면, 메모이즈 안 된 인라인 콜백을 받았을 때 `fetch → setState → 리렌더 → 새 identity → fetch` 무한 요청 루프가 됩니다. 조회 대상이 바뀔 때 다시 부르려면 `refreshKey`에 **원시값**을 넘기세요(`AgentStatusBadge`가 `{ refreshKey: agentType }`으로 사용).
- **`respectQuietHours`는 기본 false입니다.** 가시성 게이팅만으로 "아무도 안 보는 탭이 DB를 깨우는" 문제는 이미 해결됩니다. 탭이 보인다 = 사용자가 화면 앞에 있다는 뜻이라, 새벽 중단을 켜면 야근·시차 근무자에게는 화면이 멈춘 것처럼 보입니다. `MessengerView`를 나중에 이 훅으로 통일할 때는 기존 동작을 유지하려면 명시적으로 `true`를 넘기면 됩니다.

**수정한 3곳:**

| 파일 | 이전 | 이후 |
|---|---|---|
| `src/components/layout/Header.tsx` | 30초, 게이트 없음 | `useVisiblePolling(refreshUnread, 30000, { immediate: false })`. 페이지 이동 시 즉시 갱신은 별도 effect로 유지 |
| `src/app/(app)/leave/LeaveAdminPanel.tsx` | 20초, 게이트 없음 | `useVisiblePolling(fetchPending, 20000, { immediate: false })`. 초기 데이터는 서버 props |
| `src/components/AgentStatusBadge.tsx` | 30초, 게이트 없음 | `useVisiblePolling(check, 30_000)`. 마운트/agentType 변경 시 즉시 1회는 훅이 담당 |

**손대지 않은 것(하자 아님):**
- `src/components/AutoRefresh.tsx` — 이미 `document.hidden` 체크 있음
- `src/app/(app)/messenger/MessengerView.tsx` — 이미 `visibleRef` + `isQuietHours()` 있음. 동작 중인 실시간 파이프라인이라 리스크 피해서 그대로 둠 (그래서 `isQuietHours`가 훅과 중복 정의돼 있음 — 나중에 정리 가능)
- `src/app/api/agent/sse/bridge/route.ts` — 서버 사이드 SSE 타이머라 브라우저 탭 가시성과 무관
- `src/app/(app)/attendance/WorkingTimer.tsx` — 로컬 시계 계산만, fetch 없음

**동작 변화 범위:** 이번 변경은 **가시성 체크 추가가 전부**입니다. 탭이 보이는 동안에는 세 화면 모두 이전과 똑같은 주기로 갱신됩니다(초안에서는 새벽 2~8시 중단도 함께 적용했다가, 야간 근무 중인 관리자에게 승인 대기 목록이 안내 없이 멈춰 보이는 문제가 있어 되돌렸습니다).

**`AgentStatusBadge`에서 걸렸던 lint:** 초기 1회 호출을 컴포넌트 쪽 `useEffect(() => { check(); }, [check])`로 두면 `react-hooks/set-state-in-effect`에 걸립니다. 그래서 초기 실행 책임을 훅 안으로 옮겼습니다. **같은 패턴을 다른 곳에 또 쓰지 마세요** — 훅의 `immediate`를 쓰면 됩니다.

## 그 이전 작업 요약 (2026-08-11까지)

1. **DB Neon → Supabase 이전.** 25개 테이블 전량 이전, 건수 일치 확인. Neon 프로젝트는 삭제되어 롤백 불가. `src/lib/prisma.ts`(Neon 어댑터 → `pg` 어댑터), `src/lib/auth.ts`(Neon 전용 SQL 클라이언트 → Prisma raw query) 교체.
2. **Anthropic API 의존성 제거.** `agent_bridge`가 각 PC에 로그인된 Hermes CLI 구독 세션을 사용. 명령 형식: `hermes chat -q "<질문>" --quiet --source <태그>`.
3. **Windows 배치 파일 버그 3종 수정** (CRLF/인코딩, `%~dp0` Python 문자열, PID 오탐). 아래 "하지 말아야 할 것" 참고.
4. **메신저 ↔ 신규 실시간 파이프라인 연결.** 라우팅은 에이전트 종류 하드코딩이 아니라 **브릿지 하트비트 기반**(`isBridgeOnline()`) — 브릿지가 켜져 있으면 자동으로 신규 `agent_jobs`/SSE 경로, 꺼져 있으면 자동으로 구형 경로. 코드에 hermes/marketer 분기 없음.

이후 Codex가 진행한 작업 (커밋 `d2ca522`~`0065629`): Drive 증분 검색 인덱싱, 에이전트 요청자 컨텍스트 바인딩 및 ERP 출처 인용, 시트 액션 실행, 브릿지 복구/워치독(`watch_bridge.ps1`, `install_watchdog.ps1`), 시트 생성 CLI(`npm run sheet:create`), SSE UTF-8 디코딩 수정.

## 남은 일

1. **마케터 브릿지가 이 노트북에서 3주+ 꺼져 있음** — 필요하면 `check_marketer.cmd` → `start_marketer.cmd`.
2. **메신저 실시간 연동 end-to-end 테스트 미완료** — API 레벨로만 검증됨(약 19.9초, 목표 45초 이내). 실제 로그인한 브라우저로 확인 필요: 2초 내 "작성 중" 표시, 새로고침 없이 답변 자동 표시, 45초 이내 완료. 브릿지가 온라인이어야 신규 경로를 탑니다.
3. **`MessengerView.tsx` lint 에러 2건** — 오탐이지만 폴링 구조를 `useVisiblePolling`으로 통일하면 같이 해소됨. 동작 중인 코드라 신중히.
4. **`isQuietHours` 중복 정의** — `src/lib/useVisiblePolling.ts`와 `MessengerView.tsx` 두 곳. 3번과 함께 정리하면 됨.

## 주요 파일 위치

| 영역 | 경로 |
|---|---|
| DB 스키마/마이그레이션 | `prisma/schema.prisma`, `prisma/migrations/` |
| DB 클라이언트/로그인 | `src/lib/prisma.ts`, `src/lib/auth.ts` |
| 메신저 전송 로직(라우팅 분기점) | `src/app/actions/message.ts` |
| 메신저 UI | `src/app/(app)/messenger/MessengerView.tsx` |
| 신규 에이전트 파이프라인 API | `src/app/api/agent/jobs/`, `src/app/api/agent/sse/` |
| 구형 폴링 경로(브릿지 오프라인 시 폴백) | `src/app/api/agent/messages/pending`, `src/lib/hermesWebhook.ts` |
| 클라이언트 폴링 공용 훅 | `src/lib/useVisiblePolling.ts` |
| Python 브릿지 | `agent_bridge/` (`client.py`, `hermes_cli.py`, `preflight.py`, `runners/`, `check_*.cmd`, `start_*.cmd`, `watch_bridge.ps1`) |
| Google Drive/Sheets 연동 | `src/lib/googleClient.ts`, `src/lib/driveIndex.ts`, `src/app/api/agent/sheets/*` |

## 비밀값 위치 (값 자체는 여기 적지 않음)

- **Render 대시보드** env vars: `DATABASE_URL`, `ERP_AGENT_API_KEY`, `HERMES_BRIDGE_API_KEY`, `MARKETER_BRIDGE_API_KEY`, `DRIVE_TOKEN_ENC_KEY`, `AUTH_GOOGLE_ID/SECRET`, `GOOGLE_SERVICE_ACCOUNT_*`, `NEXTAUTH_SECRET` 등. `render.yaml`엔 이름만 선언(`sync: false`), 값은 없음.
- **로컬 `.env`** (저장소 루트, gitignore됨).
- **`agent_bridge/marketer.env`, `agent_bridge/hermes.env`**: 각 브릿지 전용 (gitignore됨). `ERP_AGENT_API_KEY`에 각각 `MARKETER_BRIDGE_API_KEY`/`HERMES_BRIDGE_API_KEY`와 같은 값을 넣어야 함. **이 노트북엔 `marketer.env`만 있고 `hermes.env`는 없음**(헤르메스는 회사 PC 담당) — 정상입니다.

## 하지 말아야 할 것 (실제 사고에서 배운 것)

- **`prisma db push` / `migrate reset` 금지** — 항상 migration 파일 작성 후 `migrate deploy`. 프로덕션 DB에 런타임 self-heal로 이미 만들어진 스키마와 충돌할 수 있으니 배포 전 실제 DB 스키마와 비교부터.
- **`.cmd` 파일은 반드시 CRLF 유지.** LF로 저장되면 UTF-8 한글과 결합해 cmd.exe 배치 파서가 깨지고, Hermes가 설치돼 있어도 "찾을 수 없음"으로 오탐합니다. 편집 후 항상 줄바꿈 확인.
- **`agent_bridge/marketer.env`, `hermes.env` 절대 커밋 금지** (이미 gitignore됨).
- **Hermes CLI 모델/`reasoning_effort` 임의 변경 금지** — 응답 품질 트레이드오프가 있어 사용자 승인 필요.
- **회사 PC의 구형 폴링/봇 프로세스를 강제 종료하지 말 것.**
- **새 클라이언트 폴러를 만들 때 `setInterval`을 맨손으로 쓰지 말 것** — 반드시 `useVisiblePolling`을 쓰세요. 이 규칙을 어긴 게 DB 무료 한도 소진 사고의 원인이었습니다.

## 참고: 저장소 루트의 미추적 파일

`venue_*.py`, `__pycache__/`는 이 프로젝트와 무관한 파일들입니다(장소 목록 스크래핑용). 커밋하지 말고 그대로 두세요.
