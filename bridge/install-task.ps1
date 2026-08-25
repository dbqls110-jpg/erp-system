# 브릿지를 Windows 작업 스케줄러에 등록한다.
#
# 부팅 시 자동 시작하고, 프로세스가 죽으면 스케줄러가 다시 띄운다.
# 관리자 권한 PowerShell 에서 실행할 것.
#
#   .\install-task.ps1            등록
#   .\install-task.ps1 -Remove    등록 해제

param([switch]$Remove)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$TaskName = "ERP-Agent-Bridge"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $Here "bridge.ps1"

# 관리자 권한 확인 — 없으면 등록이 조용히 실패하는 대신 명확히 알려준다.
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Output "관리자 권한이 필요합니다. PowerShell 을 '관리자 권한으로 실행' 후 다시 시도하세요."
    exit 1
}

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Output "등록 해제 완료: $TaskName"
    } else {
        Write-Output "등록된 작업이 없습니다: $TaskName"
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $Script)) {
    Write-Output "bridge.ps1 을 찾을 수 없습니다: $Script"
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $Here "bridge.env"))) {
    Write-Output "bridge.env 가 없습니다. bridge.env.example 을 복사해 값을 채운 뒤 다시 실행하세요."
    exit 1
}

# 이미 있으면 지우고 다시 만든다(설정 변경 반영).
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "기존 작업을 제거하고 다시 등록합니다."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`"" `
    -WorkingDirectory $Here

# 부팅 시 + 로그온 시. 로그온 트리거를 같이 두는 이유는 Codex CLI 가 사용자
# 세션의 로그인 자격을 쓰기 때문이다.
$triggers = @(
    (New-ScheduledTaskTrigger -AtStartup),
    (New-ScheduledTaskTrigger -AtLogOn)
)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999 `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -RunLevel Highest -Description "ERP 에이전트 브릿지 (상주)" | Out-Null

Write-Output "등록 완료: $TaskName"
Write-Output "  · 부팅/로그온 시 자동 시작"
Write-Output "  · 죽으면 1분 뒤 재시작 (최대 999회)"
Write-Output "  · 실행 시간 제한 없음"
Write-Output ""
Write-Output "지금 바로 시작하려면: Start-ScheduledTask -TaskName $TaskName"
Write-Output "상태 확인:            Get-ScheduledTask -TaskName $TaskName"
Write-Output "로그:                 Get-Content -Tail 30 `"$(Join-Path $Here 'bridge.log')`""
