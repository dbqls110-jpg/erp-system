[CmdletBinding()]
param(
    [ValidateSet("hermes", "marketer")]
    [string]$AgentType = "hermes",

    [ValidateRange(1, 60)]
    [int]$IntervalMinutes = 3
)

$ErrorActionPreference = "Stop"

$watchScript = Join-Path $PSScriptRoot "watch_bridge.ps1"
if (-not (Test-Path -LiteralPath $watchScript)) {
    throw "watch script not found: $watchScript"
}

$label = if ($AgentType -eq "hermes") { "Hermes" } else { "Marketer" }
$taskName = "ERP_${label}_Bridge_Watchdog"
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-File", "`"$watchScript`"",
    "-AgentType", $AgentType
) -join " "

$action = New-ScheduledTaskAction `
    -Execute $powerShellExe `
    -Argument $arguments `
    -WorkingDirectory $PSScriptRoot

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$repeatingTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$task = New-ScheduledTask `
    -Action $action `
    -Trigger @($logonTrigger, $repeatingTrigger) `
    -Principal $principal `
    -Settings $settings `
    -Description "Keeps the ERP $label bridge running and removes stale PID locks."

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Output "Installed and started scheduled task: $taskName"
