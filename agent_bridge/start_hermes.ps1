# ERP Hermes Agent Bridge 시작 스크립트 (PowerShell)
Set-Location $PSScriptRoot

# .env 파일 로드
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and !$line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
    Write-Host "[bridge] .env 로드 완료"
}

$env:AGENT_TYPE = "hermes"
Write-Host "[bridge] Hermes 에이전트 시작 (type=hermes)"
python client.py
