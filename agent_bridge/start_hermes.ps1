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

# 중복 실행 방지
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

# 로그 파일
$logFile = Join-Path $PSScriptRoot "hermes.log"

# 창 없이 백그라운드 실행
$proc = Start-Process -FilePath "pythonw" `
    -ArgumentList "client.py" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $logFile `
    -NoNewWindow `
    -PassThru

$proc.Id | Out-File $lockFile -Encoding ascii
Write-Host "[OK] Hermes 브릿지 시작 (PID=$($proc.Id)), 로그: hermes.log" -ForegroundColor Green
