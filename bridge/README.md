# ERP 에이전트 브릿지 (회사 PC 설치)

ERP 서버에서 작업을 가져와 로컬 Codex CLI 로 처리하고 결과를 돌려보낸다.

## 설치

```powershell
# 1) 저장소 클론 (없다면)
mkdir C:\dev
cd C:\dev
git clone https://github.com/dbqls110-jpg/erp-system.git
cd erp-system\bridge

# 2) 설정 파일 준비
copy bridge.env.example bridge.env
notepad bridge.env
```

`bridge.env` 에서 **`BRIDGE_API_KEY` 한 줄만** 채우면 된다.
값은 Render 대시보드 → erp-system → Environment → `HERMES_BRIDGE_API_KEY`.

```powershell
# 3) 먼저 손으로 한 번 돌려서 정상 동작 확인
.\bridge.ps1
#    "브릿지 시작 | agentType=hermes | codex-cli 0.146.0 ..." 이 뜨면 정상.
#    Ctrl+C 로 중단.

# 4) 작업 스케줄러 등록 (관리자 권한 PowerShell)
.\install-task.ps1
Start-ScheduledTask -TaskName ERP-Agent-Bridge
```

## 확인

```powershell
Get-ScheduledTask -TaskName ERP-Agent-Bridge      # 상태
Get-Content -Tail 30 .\bridge.log                 # 로그
```

ERP 쪽에서도 하트비트로 상태가 보인다. 브릿지가 오류를 만나면 그 내용까지 서버로
올라가므로, 이 PC 로그를 열지 않고도 원인을 확인할 수 있다.

## 동작

- 5초마다 처리할 작업이 있는지 확인
- 30초마다 하트비트 전송 (상태·모델·추론강도, 오류가 있으면 오류 요약까지)
- 작업을 받으면 `codex exec -m gpt-5.6-luna -c model_reasoning_effort="xhigh"` 로 처리
- 네트워크가 끊겨도 죽지 않고 다음 주기에 재시도

## 주의

- `bridge.env` 는 **커밋하지 않는다**. `.gitignore` 에 등록돼 있다.
- 추론강도는 `xhigh` 다. 실측해 보니 느려질 거라는 예상과 달랐다 — 같은 계산 문제로
  medium 15초 / high 16초 / xhigh 18초였고, 쉬운 질문에서는 셋 다 4~5초로 차이가 없었다.
  3초를 더 쓰는 대신 출력이 가장 정제돼 있어 `xhigh` 를 쓴다.
  유효값: `none · minimal · low · medium · high · xhigh` (`max` 는 없는 값이라 넣으면 medium 으로 떨어진다)
- Codex CLI 는 이 PC 에 로그인된 세션을 쓴다. 로그아웃하면 브릿지도 답을 못 만든다.
