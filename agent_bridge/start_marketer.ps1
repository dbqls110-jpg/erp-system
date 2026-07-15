# ERP Marketer Bridge — 노트북용 시작 스크립트 (PowerShell)
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "marketer.env"
if (-not (Test-Path $envFile)) {
    Write-Error "marketer.env 파일이 없습니다. marketer.env.example 을 복사해 값을 채워주세요."
    exit 1
}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and !$line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}
$env:AGENT_TYPE = "marketer"

$lockFile = Join-Path $PSScriptRoot "marketer.lock"
if (Test-Path $lockFile) {
    $oldPid = Get-Content $lockFile -ErrorAction SilentlyContinue
    $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "[INFO] Marketer 브릿지가 이미 실행 중입니다 (PID=$oldPid)." -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $lockFile -Force
}

$logFile = Join-Path $PSScriptRoot "marketer.log"

$proc = Start-Process -FilePath "pythonw" `
    -ArgumentList "client.py" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $logFile `
    -NoNewWindow `
    -PassThru

$proc.Id | Out-File $lockFile -Encoding ascii
Write-Host "[OK] Marketer 브릿지 시작 (PID=$($proc.Id)), 로그: marketer.log" -ForegroundColor Green
