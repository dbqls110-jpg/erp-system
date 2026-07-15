@echo off
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
python -c "import sys; sys.path.insert(0,'%~dp0'); import preflight, logging; logging.basicConfig(stream=sys.stderr,level=logging.INFO,format='%%(message)s'); ok=preflight.run('hermes'); sys.exit(0 if ok else 1)"
if errorlevel 1 (
    echo [ERROR] 사전점검 실패 — 위 오류를 해결한 뒤 다시 실행하세요.
    echo         상세 진단: check_hermes.cmd 실행
    pause
    exit /b 1
)
echo [OK] 사전점검 통과

:: ── 중복 실행 방지 ──────────────────────────────────────────────────────────
set LOCKFILE=%~dp0hermes.lock
if exist "%LOCKFILE%" (
    set /p OLDPID=<"%LOCKFILE%"
    tasklist /fi "pid eq !OLDPID!" /fo csv 2>nul | find /i "python" >nul
    if not errorlevel 1 (
        echo [INFO] Hermes 브릿지가 이미 실행 중입니다 (PID=!OLDPID!).
        exit /b 0
    )
    del "%LOCKFILE%"
)

:: ── 백그라운드 실행 (창 없음) ────────────────────────────────────────────────
start "" /b pythonw client.py
timeout /t 1 /nobreak >nul

for /f "tokens=2" %%p in ('tasklist /fi "imagename eq pythonw.exe" /fo csv /nh 2^>nul ^| findstr /i "pythonw"') do (
    set NEWPID=%%~p
    goto :got_pid
)
:got_pid
echo !NEWPID!>"%LOCKFILE%"
echo [OK] Hermes 브릿지 시작됨 (PID=!NEWPID!, 로그: hermes.log)
endlocal
