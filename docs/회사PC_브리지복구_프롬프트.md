# 회사 PC 브리지 복구 — 아래 전체를 복사해서 회사 PC의 Codex(또는 Claude)에 붙여넣으세요

---

너는 Windows PC에서 PowerShell로 작업한다. 아래를 순서대로 실행하고, 각 단계 결과를 짧게 보고해라.
확인 없이 진행해도 된다. 단, 실패한 단계가 있으면 거기서 멈추고 오류 전문을 보여줘라.

## 배경

이 PC에는 `C:\dev\erp-system` 저장소가 있고, `bridge\bridge.ps1`이 작업 스케줄러에 등록되어 돌고 있다.
브리지는 ERP 메신저의 질문을 받아 `codex exec`로 답을 만든다.
지금 Codex가 이 오류로 죽어서 메신저가 답을 못 한다:

```
ERROR codex_models_manager::cache: failed to load models cache: missing field `base_instructions`
```

원인은 Codex가 v0.146.0으로 오래됐고, 업그레이드 뒤 옛 모델 캐시 파일을 못 읽는 것이다.
저장소에는 이미 이 오류를 스스로 복구하는 브리지 수정(커밋 be27787)이 올라가 있다.

## 1. 저장소 최신으로

```powershell
cd C:\dev\erp-system
git status --short
git pull
git log --oneline -3
```

`git status`에 수정된 파일이 있으면 `git pull` 전에 나에게 보여줘라. 덮어쓰지 마라.
`git log`에 `be27787` 또는 그 이후 커밋이 보여야 한다.

## 2. Codex 최신으로

```powershell
codex --version
npm i -g @openai/codex@latest
codex --version
```

앞뒤 버전을 보고해라. 0.153 이상이면 된다.

## 3. 깨진 모델 캐시 지우기

```powershell
Remove-Item "$env:USERPROFILE\.codex\models_cache.json" -Force -ErrorAction SilentlyContinue
Test-Path "$env:USERPROFILE\.codex\models_cache.json"
```

`False`가 나와야 한다. 지우면 다음 실행 때 다시 만들어지는 파일이라 안전하다.

## 4. Codex가 한글로 답하는지 확인

```powershell
$f = Join-Path $env:TEMP "codex-check.txt"
[IO.File]::WriteAllText($f, "한글 점검입니다. '점검 완료' 네 글자만 답하세요.", (New-Object Text.UTF8Encoding $false))
Get-Content $f -Raw | codex exec -m gpt-5.6-luna -c 'model_reasoning_effort="low"' -c 'plugins={}' -s read-only --skip-git-repo-check
```

`점검 완료`가 나오면 된다. 한글이 `ë¹ì` 처럼 깨져 나오면 멈추고 출력 전문을 보여줘라.

## 5. 브리지 다시 시작

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -like "*bridge*" -or $_.TaskName -like "*erp*" } | Select-Object TaskName, State
```

브리지 작업 이름을 찾아서:

```powershell
Stop-ScheduledTask -TaskName "<찾은 이름>"
Start-ScheduledTask -TaskName "<찾은 이름>"
Start-Sleep -Seconds 5
Get-ScheduledTask -TaskName "<찾은 이름>" | Select-Object TaskName, State
```

`Running`이어야 한다. 작업 스케줄러에 없으면 `bridge\install-task.ps1`을 실행해라.

## 6. 브리지 로그 확인

```powershell
Get-ChildItem C:\dev\erp-system\bridge -Filter *.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Get-Content $_.FullName -Tail 15 }
```

최근 줄에 `ERROR`가 없고 `idle` 또는 `heartbeat`가 보이면 정상이다.

## 마지막 보고

아래 형식으로 짧게:

```
git pull      : 완료 / 커밋 xxxxxxx
codex 버전    : 0.146.0 → 0.15x.x
캐시 삭제     : 완료
한글 점검     : 점검 완료 (정상) / 깨짐
브리지 재시작  : Running
로그         : 정상 / 오류 있음 (내용)
```

## 하지 마라
- `.env`, `bridge\bridge.env` 파일을 열거나 내용을 출력하지 마라. 비밀 값이 들어 있다.
- `git reset`, `git checkout --`, `git clean` 을 쓰지 마라.
- 다른 스케줄 작업을 건드리지 마라.
