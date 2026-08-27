[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet("hermes", "marketer")]
    [string]$AgentType
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "$AgentType.env"
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "$AgentType.env is missing. Copy the example file and fill in its values."
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}
$env:AGENT_TYPE = $AgentType

$hermesExe = $env:HERMES_EXECUTABLE
if ($hermesExe -and -not (Test-Path -LiteralPath $hermesExe)) {
    throw "HERMES_EXECUTABLE does not exist: $hermesExe"
}

if (-not $hermesExe) {
    $found = Get-Command hermes -ErrorAction SilentlyContinue
    if ($found) {
        $hermesExe = $found.Source
    }
}

if (-not $hermesExe) {
    $knownPath = Join-Path $env:LOCALAPPDATA "hermes\hermes-agent\venv\Scripts\hermes.exe"
    if (Test-Path -LiteralPath $knownPath) {
        $hermesExe = $knownPath
    }
}

if (-not $hermesExe) {
    throw "Hermes executable not found. Check HERMES_EXECUTABLE or PATH."
}

$hermesScripts = Split-Path -Parent $hermesExe
$env:PATH = "$hermesScripts;$env:PATH"
$env:HERMES_EXECUTABLE = $hermesExe

$pythonExe = Join-Path $hermesScripts "python.exe"
$pythonwExe = Join-Path $hermesScripts "pythonw.exe"
if (-not (Test-Path -LiteralPath $pythonExe) -or -not (Test-Path -LiteralPath $pythonwExe)) {
    throw "Hermes virtual-environment Python was not found: $hermesScripts"
}

Write-Host "[preflight] Checking the $AgentType Hermes CLI..." -ForegroundColor Cyan
& $pythonExe -c @"
import logging
import sys
sys.path.insert(0, sys.argv[1])
import preflight
logging.basicConfig(stream=sys.stderr, level=logging.INFO, format='%(message)s')
ok = preflight.run(sys.argv[2])
sys.exit(0 if ok else 1)
"@ $PSScriptRoot $AgentType
if ($LASTEXITCODE -ne 0) {
    throw "Preflight failed. Run check_$AgentType.cmd for diagnostics."
}

$lockFile = Join-Path $PSScriptRoot "$AgentType.lock"
if (Test-Path -LiteralPath $lockFile) {
    $oldPidText = (Get-Content -LiteralPath $lockFile -Raw -ErrorAction SilentlyContinue).Trim()
    $oldPid = 0
    $oldProcess = $null
    if ([int]::TryParse($oldPidText, [ref]$oldPid)) {
        $oldProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
    }

    $isBridge = $oldProcess `
        -and $oldProcess.Name -in @("python.exe", "pythonw.exe") `
        -and $oldProcess.CommandLine -match "(^|\s|[\\/])client\.py(?:\s|$)"
    if ($isBridge) {
        Write-Host "[INFO] $AgentType bridge is already running (PID=$oldPid)." -ForegroundColor Yellow
        return
    }

    Remove-Item -LiteralPath $lockFile -Force
}

$logFile = Join-Path $PSScriptRoot "$AgentType.log"
$errorLogFile = Join-Path $PSScriptRoot "${AgentType}_error.log"
$process = Start-Process `
    -FilePath $pythonwExe `
    -ArgumentList "client.py" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $errorLogFile `
    -WindowStyle Hidden `
    -PassThru

Start-Sleep -Milliseconds 500
if ($process.HasExited) {
    throw "$AgentType bridge exited during startup (exit=$($process.ExitCode)). Check $errorLogFile."
}

$process.Id | Out-File -LiteralPath $lockFile -Encoding ascii -NoNewline
Write-Host "[OK] $AgentType bridge started (PID=$($process.Id))" -ForegroundColor Green
