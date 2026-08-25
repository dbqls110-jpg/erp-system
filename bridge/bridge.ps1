# ERP 에이전트 브릿지 (회사 PC 상주)
#
# ERP 서버에서 작업을 가져와 로컬 Codex CLI 로 처리하고 결과를 돌려보낸다.
# 상태와 오류는 하트비트로 ERP DB 에 올린다 — 이 PC 로그를 직접 열지 않고도
# 무슨 일이 있었는지 조회할 수 있게 하기 위함이다.
#
# .cmd 가 아니라 .ps1 인 이유: 배치 파일은 UTF-8 한글과 CRLF 조합에서 파서가
# 깨져 "찾을 수 없음" 오탐을 낸 적이 있다. PowerShell 은 그 문제가 없다.

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $Here "bridge.env"
$LogFile = Join-Path $Here "bridge.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Output $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding utf8
}

# ---------------------------------------------------------------- 설정 읽기
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Log "bridge.env 가 없습니다. bridge.env.example 을 복사해 값을 채우세요." "ERROR"
    exit 1
}

$Config = @{}
foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding utf8) {
    $t = $line.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { continue }
    $Config[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
}

$BaseUrl   = $Config["ERP_BASE_URL"]
$AgentType = $Config["AGENT_TYPE"]
$ApiKey    = $Config["BRIDGE_API_KEY"]
$Model     = if ($Config["CODEX_MODEL"]) { $Config["CODEX_MODEL"] } else { "gpt-5.6-luna" }
$Effort    = if ($Config["CODEX_EFFORT"]) { $Config["CODEX_EFFORT"] } else { "xhigh" }
$PollSec   = [int](if ($Config["POLL_INTERVAL_SEC"]) { $Config["POLL_INTERVAL_SEC"] } else { 5 })
$BeatSec   = [int](if ($Config["HEARTBEAT_INTERVAL_SEC"]) { $Config["HEARTBEAT_INTERVAL_SEC"] } else { 30 })

if (-not $BaseUrl -or -not $AgentType -or -not $ApiKey) {
    Write-Log "ERP_BASE_URL / AGENT_TYPE / BRIDGE_API_KEY 를 bridge.env 에 채워야 합니다." "ERROR"
    exit 1
}

# ------------------------------------------------------------- 사전 점검
$codex = Get-Command codex -ErrorAction SilentlyContinue
if (-not $codex) {
    Write-Log "codex 를 PATH 에서 찾을 수 없습니다. Codex CLI 설치를 확인하세요." "ERROR"
    exit 1
}
$CodexVersion = (& codex --version 2>&1 | Select-Object -First 1)
Write-Log "브릿지 시작 | agentType=$AgentType | $CodexVersion | model=$Model effort=$Effort"

$Headers = @{ "Authorization" = "Bearer $ApiKey"; "Content-Type" = "application/json" }

function Send-Heartbeat {
    param([string]$Status = "idle", [string]$LastError = $null)
    $payload = @{
        agentType = $AgentType
        version   = "3.0.0-ps"
        hostname  = $env:COMPUTERNAME
        status    = $Status
        model     = $Model
        effort    = $Effort
    }
    if ($LastError) { $payload["lastError"] = $LastError }
    try {
        Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/agent/bridge/heartbeat" `
            -Headers $Headers -Body ($payload | ConvertTo-Json -Compress) -TimeoutSec 30 | Out-Null
    } catch {
        Write-Log "하트비트 전송 실패: $($_.Exception.Message)" "WARN"
    }
}

function Invoke-Codex {
    param([string]$Prompt)
    # 프롬프트를 임시 파일로 넘긴다. 명령줄에 직접 넣으면 한글·따옴표에서 깨진다.
    $tmp = Join-Path $env:TEMP ("codex-" + [guid]::NewGuid().ToString() + ".txt")
    try {
        Set-Content -LiteralPath $tmp -Value $Prompt -Encoding utf8
        $out = & codex exec -m $Model -c "model_reasoning_effort=`"$Effort`"" -c 'plugins={}' `
                    -s read-only --skip-git-repo-check (Get-Content -Raw -LiteralPath $tmp) 2>&1
        return ($out | Out-String)
    } finally {
        Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    }
}

# ------------------------------------------------------------------ 본 루프
$lastBeat = [datetime]::MinValue
Send-Heartbeat -Status "idle"

while ($true) {
    try {
        if (((Get-Date) - $lastBeat).TotalSeconds -ge $BeatSec) {
            Send-Heartbeat -Status "idle"
            $lastBeat = Get-Date
        }

        $res = Invoke-RestMethod -Method Get `
            -Uri "$BaseUrl/api/agent/bridge/jobs?agentType=$AgentType" `
            -Headers $Headers -TimeoutSec 30

        if (-not $res.job) { Start-Sleep -Seconds $PollSec; continue }

        $jobId = $res.job.id
        Write-Log "작업 수신: $jobId"
        Send-Heartbeat -Status "working"

        Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/agent/bridge/jobs/$jobId" `
            -Headers $Headers -Body (@{ status = "processing" } | ConvertTo-Json -Compress) `
            -TimeoutSec 30 | Out-Null

        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $answer = Invoke-Codex -Prompt $res.job.input
            $sw.Stop()
            Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/agent/bridge/jobs/$jobId" `
                -Headers $Headers `
                -Body (@{ status = "completed"; output = $answer } | ConvertTo-Json -Compress) `
                -TimeoutSec 60 | Out-Null
            Write-Log "완료: $jobId ($([int]$sw.Elapsed.TotalSeconds)초)"
        } catch {
            $sw.Stop()
            $msg = $_.Exception.Message
            Write-Log "작업 실패: $jobId - $msg" "ERROR"
            Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/agent/bridge/jobs/$jobId" `
                -Headers $Headers `
                -Body (@{ status = "error"; errorMsg = $msg } | ConvertTo-Json -Compress) `
                -TimeoutSec 30 | Out-Null
            Send-Heartbeat -Status "error" -LastError $msg
        }
        $lastBeat = Get-Date
    } catch {
        # 네트워크 단절 등으로 루프 자체가 실패해도 죽지 않는다. 다음 주기에 재시도한다.
        $msg = $_.Exception.Message
        Write-Log "루프 오류: $msg" "WARN"
        Send-Heartbeat -Status "error" -LastError $msg
        Start-Sleep -Seconds ([Math]::Max($PollSec, 10))
    }
}
