<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 프로젝트 규칙

인수인계 문서는 `HANDOFF.md`. 작업 시작 전에 읽으세요.

## 1. `git pull` 직후엔 `npx prisma generate`

안 하면 `src/lib/driveIndex.ts` 등에서 "Property 'xxx' does not exist on type 'PrismaClient'" 타입 에러가 무더기로 납니다. 코드 버그가 아닙니다.

## 2. 클라이언트 폴링은 반드시 `useVisiblePolling`

`src/lib/useVisiblePolling.ts`를 쓰세요. `setInterval`로 직접 폴러를 만들지 마세요.

가시성 체크 없는 폴러는 아무도 안 보는 백그라운드 탭에서 DB를 하루 종일 깨워놓습니다. 실제로 이것 때문에 Neon 무료 플랜 컴퓨트 시간이 소진돼 DB를 Supabase로 이전해야 했습니다. Supabase에서도 같은 식으로 재발할 수 있습니다.

초기 1회 실행이 필요하면 훅의 `immediate` 옵션을 쓰세요. 컴포넌트 쪽에서 `useEffect(() => { fetchThing(); }, [fetchThing])`로 처리하면 `react-hooks/set-state-in-effect` lint 에러가 납니다.

## 3. DB 스키마는 migration 파일로만

`prisma db push`, `prisma migrate reset` 금지. migration 파일을 작성하고 `prisma migrate deploy`를 쓰세요.

`npx prisma migrate status`가 `20260722141000_add_drive_search_index`를 미적용으로 표시하는 건 알려진 정상 상태입니다 — 런타임 self-heal이 테이블을 이미 만들어놨고 마이그레이션 SQL이 전부 `IF NOT EXISTS`라 다음 배포 때 자동 정리됩니다. 손대지 마세요.

## 4. `agent_bridge/*.cmd` 파일은 CRLF 유지

LF로 저장되면 UTF-8 한글과 결합해 cmd.exe 배치 파서가 깨집니다. 편집 후 줄바꿈을 반드시 확인하세요.

## 5. 커밋 금지 대상

`agent_bridge/marketer.env`, `agent_bridge/hermes.env`, 그리고 저장소 루트의 `venue_*.py` / `__pycache__/` (이 프로젝트와 무관한 파일들).
