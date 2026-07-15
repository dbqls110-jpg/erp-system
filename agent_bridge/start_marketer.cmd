@echo off
:: ─────────────────────────────────────────────────────────
:: ERP Marketer Bridge  (노트북용)
:: - marketer.env 에서 환경변수 로드
:: - 중복 실행 방지 (marketer.lock)
:: - 검은 창 없이 실행: pythonw 사용
:: ─────────────────────────────────────────────────────────
cd /d "%~dp0"

:: marketer.env 로드
if not exist "marketer.env" (
    echo [ERROR] marketer.env 파일이 없습니다. marketer.env.example 을 복사해 값을 채워주세요.
    pause
    exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%a in ("marketer.env") do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" if not "%%a"=="" set "%%a=%%b"
)

set AGENT_TYPE=marketer

set LOCKFILE=%~dp0marketer.lock
if exist "%LOCKFILE%" (
    set /p OLDPID=<"%LOCKFILE%"
    tasklist /fi "pid eq %OLDPID%" /fo csv 2>nul | find /i "python" >nul
    if not errorlevel 1 (
        echo [INFO] Marketer 브릿지가 이미 실행 중입니다 (PID=%OLDPID%).
        exit /b 0
    )
    del "%LOCKFILE%"
)

start "" /b pythonw client.py
timeout /t 1 /nobreak >nul

for /f "tokens=2" %%p in ('tasklist /fi "imagename eq pythonw.exe" /fo csv /nh 2^>nul ^| findstr /i "pythonw"') do (
    set NEWPID=%%~p
    goto :got_pid
)
:got_pid
echo %NEWPID%>"%LOCKFILE%"
echo [OK] Marketer 브릿지 시작됨 (PID=%NEWPID%, 로그: marketer.log)
