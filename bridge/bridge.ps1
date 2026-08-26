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
# 주의: PowerShell 에서 [int](if ...) 는 파싱되지 않는다. if 는 문이라 캐스트 안에
# 넣으려면 $( ) 부분식으로 감싸야 한다.
$PollSec   = [int]$(if ($Config["POLL_INTERVAL_SEC"]) { $Config["POLL_INTERVAL_SEC"] } else { 5 })
$BeatSec   = [int]$(if ($Config["HEARTBEAT_INTERVAL_SEC"]) { $Config["HEARTBEAT_INTERVAL_SEC"] } else { 30 })

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
# Get-Command 이 codex.ps1(스크립트)을 집어줄 수 있는데, Start-Process 는 그것을
# 실행하지 못한다("%1 is not a valid Win32 application"). 같은 폴더의 .cmd 래퍼를 쓴다.
$CodexExe = $codex.Source
if ($CodexExe -like "*.ps1") {
    $cmdWrapper = [IO.Path]::ChangeExtension($CodexExe, ".cmd")
    if (Test-Path -LiteralPath $cmdWrapper) { $CodexExe = $cmdWrapper }
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
    # 프롬프트는 stdin 으로 넘긴다.
    # 인자로 주면 Start-Process 가 공백에서 쪼개 "unexpected argument '은?'" 같은
    # 오류가 난다. codex exec 는 PROMPT 를 생략하면 stdin 에서 읽는다.
    $inFile  = Join-Path $env:TEMP ("codex-" + [guid]::NewGuid().ToString() + ".txt")
    $outFile = "$inFile.out"
    $errFile = "$inFile.err"
    try {
        # BOM 없는 UTF-8 로 쓴다. BOM 이 붙으면 프롬프트 첫 글자가 깨진다.
        [IO.File]::WriteAllText($inFile, $Prompt, (New-Object Text.UTF8Encoding $false))

        # stderr 를 파일로 분리한다. 2>&1 로 합치면 $ErrorActionPreference="Stop" 아래에서
        # PowerShell 이 네이티브 프로그램의 stderr 첫 줄을 예외로 승격시킨다. Codex 는
        # 시작 배너를 stderr 로 내보내므로 정상 실행이 실패로 둔갑한다.
        $p = Start-Process -FilePath $CodexExe -NoNewWindow -Wait -PassThru `
            -ArgumentList @(
                "exec", "-m", $Model,
                "-c", "model_reasoning_effort=`"$Effort`"",
                "-c", "plugins={}",
                "-s", "read-only", "--skip-git-repo-check"
            ) -RedirectStandardInput $inFile -RedirectStandardOutput $outFile -RedirectStandardError $errFile

        # 주의: Get-Content -Raw 는 빈 파일에서 "" 가 아니라 $null 을 돌려준다.
        # 그대로 올려 보내면 서버가 null.slice() 로 500 을 냈다. 항상 문자열로 만든다.
        $stdout = ""
        if (Test-Path -LiteralPath $outFile) {
            $raw = Get-Content -Raw -LiteralPath $outFile -Encoding utf8
            if ($null -ne $raw) { $stdout = $raw }
        }
        $stderr = ""
        if (Test-Path -LiteralPath $errFile) {
            $rawErr = Get-Content -Raw -LiteralPath $errFile -Encoding utf8
            if ($null -ne $rawErr) { $stderr = $rawErr }
        }

        if ($p.ExitCode -ne 0) {
            throw "codex exec 종료코드 $($p.ExitCode): $stderr"
        }
        # 종료코드가 0인데 출력이 비어 있으면 성공이 아니다. 빈 답을 완료로 보고하면
        # 사용자에게는 "답이 없는데 성공"으로 보여 원인을 쫓을 실마리가 사라진다.
        if ([string]::IsNullOrWhiteSpace($stdout)) {
            throw "codex 가 종료코드 0으로 끝났지만 출력이 비었습니다. stderr: $stderr"
        }
        return $stdout
    } finally {
        Remove-Item -LiteralPath $inFile, $outFile, $errFile -ErrorAction SilentlyContinue
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
