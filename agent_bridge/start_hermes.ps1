# ERP Hermes Bridge — 회사 PC용 시작 스크립트 (PowerShell)
# 사용: 오른쪽 클릭 → PowerShell로 실행
Set-Location $PSScriptRoot

# hermes.env 로드
$envFile = Join-Path $PSScriptRoot "hermes.env"
if (-not (Test-Path $envFile)) {
    Write-Error "hermes.env 파일이 없습니다. hermes.env.example 을 복사해 값을 채워주세요."
    exit 1
}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and !$line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}
$env:AGENT_TYPE = "hermes"

# ── Hermes 실행 파일 경로 자동 탐색 ─────────────────────────────────────────
$hermesExe = $env:HERMES_EXECUTABLE
if (-not $hermesExe) {
    $found = Get-Command hermes -ErrorAction SilentlyContinue
    if ($found) {
        $hermesExe = $found.Source
    }
}
if (-not $hermesExe) {
    $knownPath = Join-Path $env:LOCALAPPDATA "hermes\hermes-agent\venv\Scripts\hermes.exe"
    if (Test-Path $knownPath) {
        $hermesExe = $knownPath
        $hermesScripts = Split-Path $knownPath -Parent
        $env:PATH = "$hermesScripts;$env:PATH"
        $env:HERMES_EXECUTABLE = $hermesExe
    }
}
if (-not $hermesExe) {
    Write-Error "[ERROR] hermes 실행 파일을 찾을 수 없습니다. HERMES_EXECUTABLE 환경변수를 설정하거나 Hermes 설치 경로를 PATH에 추가하세요."
    exit 1
}
Write-Host "[INFO] Hermes 실행 파일: $hermesExe" -ForegroundColor Cyan

# ── 사전점검 ──────────────────────────────────────────────────────────────────
Write-Host "[사전점검] Hermes CLI 상태 확인 중..." -ForegroundColor Cyan
$preflightResult = python -c @"
import sys; sys.path.insert(0,r'$PSScriptRoot')
import preflight, logging
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format='%(message)s')
ok = preflight.run('hermes')
sys.exit(0 if ok else 1)
"@
if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] 사전점검 실패 — 오류를 해결한 뒤 다시 실행하세요. 상세 진단: check_hermes.cmd"
    exit 1
}
Write-Host "[OK] 사전점검 통과" -ForegroundColor Green

# ── 중복 실행 방지 ───────────────────────────────────────────────────────────
$lockFile = Join-Path $PSScriptRoot "hermes.lock"
if (Test-Path $lockFile) {
    $oldPid = Get-Content $lockFile -ErrorAction SilentlyContinue
    $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "[INFO] Hermes 브릿지가 이미 실행 중입니다 (PID=$oldPid)." -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $lockFile -Force
}

# ── 로그 파일 및 창 없이 백그라운드 실행 ────────────────────────────────────
$logFile = Join-Path $PSScriptRoot "hermes.log"

$proc = Start-Process -FilePath "pythonw" `
    -ArgumentList "client.py" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $logFile `
    -NoNewWindow `
    -PassThru

$proc.Id | Out-File $lockFile -Encoding ascii
Write-Host "[OK] Hermes 브릿지 시작 (PID=$($proc.Id)), 로그: hermes.log" -ForegroundColor Green
