@echo off
if not defined ERP_UTF8_RELAUNCHED (
    chcp 65001 >nul
    set ERP_UTF8_RELAUNCHED=1
    cmd /c "%~f0" %*
    exit /b %errorlevel%
)
setlocal enabledelayedexpansion
:: ─────────────────────────────────────────────────────────
:: ERP Hermes Bridge  (회사 PC용)
:: - hermes.env 에서 환경변수 로드
:: - Hermes venv PATH 자동 추가
:: - 사전점검(preflight) 통과 후 창 없이 실행
:: ─────────────────────────────────────────────────────────
cd /d "%~dp0"

:: hermes.env 로드
if not exist "hermes.env" (
    echo [ERROR] hermes.env 파일이 없습니다. hermes.env.example 을 복사해 값을 채워주세요.
    pause
    exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%a in ("hermes.env") do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" if not "%%a"=="" set "%%a=%%b"
)

:: 환경변수 강제 설정
set AGENT_TYPE=hermes

:: ── Hermes 실행 파일 경로 자동 탐색 ──────────────────────────────────────────
:: HERMES_EXECUTABLE 이 설정돼 있으면 그 경로 사용
if defined HERMES_EXECUTABLE (
    if not exist "!HERMES_EXECUTABLE!" (
        echo [ERROR] HERMES_EXECUTABLE 경로가 존재하지 않습니다: !HERMES_EXECUTABLE!
        pause
        exit /b 1
    )
    goto :hermes_found
)

:: PATH에서 hermes 탐색
where hermes >nul 2>&1
if not errorlevel 1 goto :hermes_found

:: 알려진 설치 위치 확인
set HERMES_DEFAULT=%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts
if exist "%HERMES_DEFAULT%\hermes.exe" (
    set "PATH=%HERMES_DEFAULT%;%PATH%"
    set "HERMES_EXECUTABLE=%HERMES_DEFAULT%\hermes.exe"
    goto :hermes_found
)

echo [ERROR] hermes 실행 파일을 찾을 수 없습니다.
echo 해결 방법:
echo   1. HERMES_EXECUTABLE 환경변수에 hermes.exe 전체 경로를 설정하세요
echo   2. Hermes 설치 폴더를 PATH에 추가하세요
pause
exit /b 1

:hermes_found

:: ── 사전점검: visible python 창으로 preflight 실행 ───────────────────────────
echo [사전점검] Hermes CLI 상태 확인 중...
python -c "import sys; sys.path.insert(0, sys.argv[1]); import preflight, logging; logging.basicConfig(stream=sys.stderr,level=logging.INFO,format='%%(message)s'); ok=preflight.run('hermes'); sys.exit(0 if ok else 1)" "%~dp0\"
if errorlevel 1 (
    echo [ERROR] 사전점검 실패 — 위 오류를 해결한 뒤 다시 실행하세요.
    echo         상세 진단: check_hermes.cmd 실행
    pause
    exit /b 1
)
echo [OK] 사전점검 통과

:: ── 중복 실행 방지 (lock의 PID가 실제 hermes client.py인지 명령줄로 검증) ──────
set LOCKFILE=%~dp0hermes.lock
if not exist "%LOCKFILE%" goto :start_bridge

set /p OLDPID=<"%LOCKFILE%"
set "OLDCMD="
for /f "usebackq delims=" %%c in (`powershell -NoProfile -NonInteractive -Command "try { (Get-CimInstance Win32_Process -Filter 'ProcessId=!OLDPID!' -ErrorAction Stop).CommandLine } catch { '' }"`) do set "OLDCMD=%%c"
echo !OLDCMD! | findstr /i "client.py" >nul
if errorlevel 1 goto :stale_lock
echo [INFO] Hermes 브릿지가 이미 실행 중입니다 (PID=!OLDPID!).
exit /b 0

:stale_lock
del "%LOCKFILE%"

:start_bridge
:: ── 백그라운드 실행 (창 없음), PowerShell Start-Process -PassThru로 정확한 PID 캡처 ──
:: PID는 파이프(for /f)가 아니라 임시 파일로 전달한다 — 백그라운드로 뜬 pythonw가
:: for /f의 파이프 핸들을 상속해 EOF가 오지 않아 무한 대기하는 것을 방지하기 위함.
set "PIDFILE=%~dp0hermes.pid.tmp"
if exist "%PIDFILE%" del "%PIDFILE%"
powershell -NoProfile -NonInteractive -Command "try { $p = Start-Process -FilePath 'pythonw' -ArgumentList 'client.py' -WindowStyle Hidden -RedirectStandardOutput 'hermes.log' -RedirectStandardError 'hermes_error.log' -PassThru -ErrorAction Stop; Set-Content -Path 'hermes.pid.tmp' -Value $p.Id -NoNewline } catch { }"

set "NEWPID="
if exist "%PIDFILE%" set /p NEWPID=<"%PIDFILE%"
if exist "%PIDFILE%" del "%PIDFILE%"

if defined NEWPID goto :bridge_started
echo [ERROR] Hermes 브릿지 프로세스 시작 실패.
exit /b 1

:bridge_started
echo !NEWPID!>"%LOCKFILE%"
echo [OK] Hermes 브릿지 시작됨 (PID=!NEWPID!, 로그: hermes.log)
endlocal
