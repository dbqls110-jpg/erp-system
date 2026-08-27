<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## ERP 작업 완료 및 동기화 규칙

- 작업을 끝내기 전에 `git status --short --branch`와 변경 파일 목록을 확인한다.
- `.env`, `.env.*`, 비밀번호·API 키·토큰·인증서·서비스 계정 JSON·`node_modules`·빌드 산출물이 변경 목록에 없는지 파일명과 diff 내용으로 검사한다. 비밀값은 출력하거나 커밋하지 않는다.
- 가능한 경우 `npm test`, `npm run lint`, `npm run build`를 실행하고 결과를 확인한다.
- 검토와 테스트가 끝난 뒤에만 `powershell -ExecutionPolicy Bypass -File .\scripts\sync-erp.ps1 -Yes`를 수동으로 실행해 동기화한다. 저장할 때마다 자동 push하지 않는다.
- 동기화 스크립트는 안전한 ERP 변경 파일만 명시적으로 stage하고 `origin/main`으로 일반 push한다. `git reset --hard`, `git checkout --`, `git clean`, `git pull`, `git rebase`, force push는 실행하지 않는다.
- commit 또는 push가 거부되거나 충돌하면 즉시 중단하고 원인을 확인한 뒤 사용자에게 보고한다.
