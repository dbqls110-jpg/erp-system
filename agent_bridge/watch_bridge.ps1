[CmdletBinding()]
param(
    [ValidateSet("hermes", "marketer")]
    [string]$AgentType = "hermes"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$lockFile = Join-Path $PSScriptRoot "$AgentType.lock"
$watchLog = Join-Path $PSScriptRoot "$AgentType.watchdog.log"
$startScript = Join-Path $PSScriptRoot "start_$AgentType.ps1"

function Write-WatchdogLog {
    param([string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $watchLog -Value "$timestamp $Message" -Encoding utf8
}

function Get-BridgeProcess {
    param([int]$ProcessId)

    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (-not $process) {
        return $null
    }

    $isPython = $process.Name -in @("python.exe", "pythonw.exe")
    $isBridge = $process.CommandLine -match "(^|\s|[\\/])client\.py(?:\s|$)"
    if (-not ($isPython -and $isBridge)) {
        return $null
    }

    return $process
}

try {
    if (Test-Path -LiteralPath $lockFile) {
        $lockValue = (Get-Content -LiteralPath $lockFile -Raw -ErrorAction SilentlyContinue).Trim()
        $lockPid = 0
        if ([int]::TryParse($lockValue, [ref]$lockPid)) {
            $bridgeProcess = Get-BridgeProcess -ProcessId $lockPid
            if ($bridgeProcess) {
                exit 0
            }
        }

        Remove-Item -LiteralPath $lockFile -Force
        Write-WatchdogLog "stale lock removed (pid=$lockValue)"
    }

    if (-not (Test-Path -LiteralPath $startScript)) {
        throw "start script not found: $startScript"
    }

    Write-WatchdogLog "bridge process missing; restart requested"
    & $startScript

    $newLockValue = (Get-Content -LiteralPath $lockFile -Raw -ErrorAction SilentlyContinue).Trim()
    $newPid = 0
    if (-not [int]::TryParse($newLockValue, [ref]$newPid)) {
        throw "bridge start did not create a valid lock"
    }

    $newProcess = Get-BridgeProcess -ProcessId $newPid
    if (-not $newProcess) {
        throw "bridge process validation failed after start (pid=$newPid)"
    }

    Write-WatchdogLog "bridge restarted successfully (pid=$newPid)"
    exit 0
}
catch {
    Write-WatchdogLog "ERROR: $($_.Exception.Message)"
    Write-Error $_
    exit 1
}
