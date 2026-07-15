@echo off
:: ─────────────────────────────────────────────────────────
:: ERP Hermes Bridge  (회사 PC용)
:: - hermes.env 에서 환경변수 로드
:: - 중복 실행 방지 (hermes.lock)
:: - 검은 창 없이 실행: pythonw 사용
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

:: 중복 실행 방지
set LOCKFILE=%~dp0hermes.lock
if exist "%LOCKFILE%" (
    set /p OLDPID=<"%LOCKFILE%"
    tasklist /fi "pid eq %OLDPID%" /fo csv 2>nul | find /i "python" >nul
    if not errorlevel 1 (
        echo [INFO] Hermes 브릿지가 이미 실행 중입니다 (PID=%OLDPID%).
        exit /b 0
    )
    del "%LOCKFILE%"
)

:: 백그라운드 실행 (창 없음)
start "" /b pythonw client.py
timeout /t 1 /nobreak >nul

:: PID 저장
for /f "tokens=2" %%p in ('tasklist /fi "imagename eq pythonw.exe" /fo csv /nh 2^>nul ^| findstr /i "pythonw"') do (
    set NEWPID=%%~p
    goto :got_pid
)
:got_pid
echo %NEWPID%>"%LOCKFILE%"
echo [OK] Hermes 브릿지 시작됨 (PID=%NEWPID%, 로그: hermes.log)
