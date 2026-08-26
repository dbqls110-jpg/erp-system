# 브릿지 진단. 회사 PC 에서 한 번 돌리고 출력을 그대로 붙여넣으면 된다.
#
# 브릿지가 "완료"로 보고했는데 서버에는 답이 비어 있는 문제를 좁히기 위한 것이다.
# 어디서 값이 사라지는지 단계별로 찍는다. 서버에는 아무것도 보내지 않는다.

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Output "=== 1. bridge.ps1 이 최신인가 ==="
$script = Join-Path $Here "bridge.ps1"
$body = Get-Content -Raw -LiteralPath $script -Encoding utf8
if ($body -match "출력이 비었습니다") {
    Write-Output "  최신 (빈 출력 검사 있음)"
} else {
    Write-Output "  옛 버전 (빈 출력 검사 없음) — git pull 이 반영되지 않았습니다"
}

Write-Output ""
Write-Output "=== 2. PowerShell / 인코딩 ==="
Write-Output "  PSVersion       : $($PSVersionTable.PSVersion)"
Write-Output "  OutputEncoding  : $([Console]::OutputEncoding.WebName)"

Write-Output ""
Write-Output "=== 3. codex 를 브릿지와 똑같이 실행 ==="
$codex = (Get-Command codex -ErrorAction SilentlyContinue).Source
if (-not $codex) { Write-Output "  codex 를 PATH 에서 못 찾음"; exit 1 }
if ($codex -like "*.ps1") {
    $cmd = [IO.Path]::ChangeExtension($codex, ".cmd")
    if (Test-Path -LiteralPath $cmd) { $codex = $cmd }
}
Write-Output "  실행 파일: $codex"

$inFile  = Join-Path $env:TEMP ("diag-" + [guid]::NewGuid().ToString() + ".txt")
$outFile = "$inFile.out"
$errFile = "$inFile.err"

try {
    [IO.File]::WriteAllText($inFile, "1 더하기 1은? 숫자만 답하세요.", (New-Object Text.UTF8Encoding $false))

    $p = Start-Process -FilePath $codex -NoNewWindow -Wait -PassThru `
        -ArgumentList @(
            "exec", "-m", "gpt-5.6-luna",
            "-c", "model_reasoning_effort=`"xhigh`"",
            "-c", "plugins={}",
            "-s", "read-only", "--skip-git-repo-check"
        ) -RedirectStandardInput $inFile -RedirectStandardOutput $outFile -RedirectStandardError $errFile

    Write-Output "  종료코드: $($p.ExitCode)"
    Write-Output "  stdout 파일 크기: $((Get-Item $outFile -ErrorAction SilentlyContinue).Length) bytes"
    Write-Output "  stderr 파일 크기: $((Get-Item $errFile -ErrorAction SilentlyContinue).Length) bytes"

    $raw = Get-Content -Raw -LiteralPath $outFile -Encoding utf8
    Write-Output ""
    Write-Output "=== 4. 브릿지가 읽어들인 값 ==="
    Write-Output "  `$raw 타입   : $(if ($null -eq $raw) { '$null' } else { $raw.GetType().FullName })"
    Write-Output "  `$raw 길이   : $(if ($null -eq $raw) { '-' } else { $raw.Length })"
    Write-Output "  `$raw 내용   : $(if ($null -eq $raw) { '-' } else { '[' + $raw.Trim() + ']' })"

    $stdout = ""
    if ($null -ne $raw) { $stdout = $raw }

    Write-Output ""
    Write-Output "=== 5. 서버로 보낼 JSON ==="
    $payload = @{ status = "completed"; output = $stdout }
    $json = $payload | ConvertTo-Json -Compress
    Write-Output "  길이: $($json.Length)"
    Write-Output "  앞 300자: $($json.Substring(0, [Math]::Min(300, $json.Length)))"

    Write-Output ""
    Write-Output "=== 6. 그 JSON 을 다시 파싱하면 output 이 살아 있는가 ==="
    $back = $json | ConvertFrom-Json
    Write-Output "  status : $($back.status)"
    Write-Output "  output 타입: $(if ($null -eq $back.output) { '$null' } else { $back.output.GetType().FullName })"
    Write-Output "  output 길이: $(if ($null -eq $back.output) { '-' } else { $back.output.Length })"

    Write-Output ""
    Write-Output "=== 7. stderr 앞 300자 ==="
    $rawErr = Get-Content -Raw -LiteralPath $errFile -Encoding utf8
    if ($null -eq $rawErr) { Write-Output "  (비어 있음)" }
    else { Write-Output "  $($rawErr.Substring(0, [Math]::Min(300, $rawErr.Length)))" }
} finally {
    Remove-Item -LiteralPath $inFile, $outFile, $errFile -ErrorAction SilentlyContinue
}
