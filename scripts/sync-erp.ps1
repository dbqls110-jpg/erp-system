[CmdletBinding()]
param(
    [string]$Message = "chore(sync): sync ERP changes",
    [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $stderrPath = [System.IO.Path]::GetTempFileName()
    $stderr = @()
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& git -C $projectRoot @Arguments 2> $stderrPath)
        $exitCode = $LASTEXITCODE
        if (Test-Path -LiteralPath $stderrPath) {
            $stderr = @(Get-Content -LiteralPath $stderrPath)
        }
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
    }

    if ($exitCode -ne 0) {
        $details = (($output + $stderr) -join [Environment]::NewLine).Trim()
        if ([string]::IsNullOrWhiteSpace($details)) {
            $details = "no output"
        }
        throw "git $($Arguments -join ' ') failed: $details"
    }
    return $output
}

function Normalize-GitPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $normalized = $Path.Trim().Replace("\", "/")
    while ($normalized.StartsWith("./")) {
        $normalized = $normalized.Substring(2)
    }
    return $normalized
}

function Test-BlockedPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $normalized = Normalize-GitPath $Path
    $segments = $normalized -split "/"
    $name = $segments[-1]

    if ($segments | Where-Object { $_ -in @("node_modules", ".next", "out", "build", "dist", "coverage") }) {
        return $true
    }

    if ($name -match "(?i)^\.env(?:\..*)?$") {
        return $true
    }

    if ($name -match "(?i)\.(pem|key|crt|cer|der|p12|pfx|jks|keystore)$") {
        return $true
    }

    if ($name -match "(?i)(service[-_]?account|credentials?|passwords?|secret)[^/]*\.json$") {
        return $true
    }

    if ($name -match "(?i)\.(secret|secrets|credential|credentials)$") {
        return $true
    }

    return $false
}

function Assert-NoSecretInDiff {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$DiffArguments
    )

    $diffText = ((Invoke-Git $DiffArguments) -join "`n")

    $privateKeyMarker = "PRIVATE" + " KEY"
    $patterns = @(
        '(?im)^\+.*(?<![\w.])(?:api[_-]?key|client[_-]?secret|password|passwd|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*["''][^"'']+["'']',
        "(?im)^\+.*-----BEGIN .*$privateKeyMarker-----",
        '(?im)^\+.*\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})\b'
    )

    foreach ($pattern in $patterns) {
        if ($diffText -match $pattern) {
            throw "A possible secret pattern was found in the diff. Stopping; do not print or commit secrets."
        }
    }
}

$gitRoot = (Invoke-Git @("rev-parse", "--show-toplevel") | Select-Object -First 1).Trim()
if ([string]::IsNullOrWhiteSpace($gitRoot)) {
    throw "The ERP project root is not a Git repository."
}
$gitRoot = (Resolve-Path $gitRoot).Path
if ($gitRoot -ne $projectRoot) {
    throw "The script is not running from the ERP project root: $projectRoot"
}

$branch = (Invoke-Git @("branch", "--show-current") | Select-Object -First 1).Trim()
if ($branch -ne "main") {
    throw "The current branch is not main. Stopping: $branch"
}

$origin = (Invoke-Git @("remote", "get-url", "origin") | Select-Object -First 1).Trim()
if ([string]::IsNullOrWhiteSpace($origin)) {
    throw "The origin remote is not configured."
}

Write-Host "ERP root: $projectRoot"
Write-Host "branch: $branch"
Write-Host "origin: $origin"

$status = @(Invoke-Git @("status", "--short", "--branch", "--untracked-files=all"))
Write-Host "Current Git status:"
$status | ForEach-Object { Write-Host $_ }

$trackedChanges = @(Invoke-Git @("diff", "--name-only", "HEAD", "--"))
$untrackedChanges = @(Invoke-Git @("ls-files", "--others", "--exclude-standard"))
$candidatePaths = @($trackedChanges + $untrackedChanges) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { Normalize-GitPath $_ } |
    Sort-Object -Unique

if ($candidatePaths.Count -eq 0) {
    Write-Host "There are no changes to synchronize."
    exit 0
}

$blockedPaths = @($candidatePaths | Where-Object { Test-BlockedPath $_ })
if ($blockedPaths.Count -gt 0) {
    Write-Host "Blocked secret or generated files:"
    $blockedPaths | ForEach-Object { Write-Host "- $_" }
    throw "Blocked files are never silently excluded. Stopping for safety; move or review them, then run again."
}

Assert-NoSecretInDiff @("diff", "HEAD", "--unified=0", "--")

Write-Host "ERP files to commit:"
$candidatePaths | ForEach-Object { Write-Host "- $_" }

if (-not $Yes) {
    $confirmation = Read-Host "Type COMMIT to stage, commit, and push the files above"
    if ($confirmation -cne "COMMIT") {
        Write-Host "No confirmation was provided. Stopping without changing files."
        exit 1
    }
}

Invoke-Git @("diff", "--check", "HEAD", "--") | Out-Host
Invoke-Git (@("add", "--") + $candidatePaths) | Out-Host

$stagedPaths = @(Invoke-Git @("diff", "--cached", "--name-only", "--")) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { Normalize-GitPath $_ } |
    Sort-Object -Unique

if ($stagedPaths.Count -eq 0) {
    Write-Host "No staged changes were found; commit and push were skipped."
    exit 0
}

$stagedBlockedPaths = @($stagedPaths | Where-Object { Test-BlockedPath $_ })
if ($stagedBlockedPaths.Count -gt 0) {
    $stagedBlockedPaths | ForEach-Object { Write-Host "Blocked staged file: $_" }
    throw "A blocked file is staged; commit is not allowed."
}

Assert-NoSecretInDiff @("diff", "--cached", "--unified=0", "--")
Invoke-Git @("diff", "--cached", "--check") | Out-Host

Write-Host "Final commit files:"
$stagedPaths | ForEach-Object { Write-Host "- $_" }

Invoke-Git @("commit", "-m", $Message) | Out-Host
$commitHash = (Invoke-Git @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
Write-Host "Commit complete: $commitHash"

try {
    Invoke-Git @("push", "origin", "main") | Out-Host
}
catch {
    Write-Error "The origin/main push was rejected; stopping. No pull, rebase, or force push was run. Reason: $($_.Exception.Message)"
    exit 1
}

Write-Host "Push complete: origin/main ($commitHash)"
