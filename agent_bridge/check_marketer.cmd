@echo off
setlocal enabledelayedexpansion
:: ─────────────────────────────────────────────────────────
:: ERP Marketer Bridge — 설치 확인 스크립트 (가시적 창)
:: 브릿지 실행 전 한 번 실행해 Hermes CLI 상태를 점검하세요.
:: ─────────────────────────────────────────────────────────
cd /d "%~dp0"
echo ============================================================
echo  ERP Marketer Bridge — 설치 확인 (check_marketer)
echo ============================================================
echo.

:: ── Hermes 실행 파일 탐색 ──────────────────────────────────────────────────
set HERMES_EXE=
if defined HERMES_EXECUTABLE (
    set HERMES_EXE=!HERMES_EXECUTABLE!
    echo [1] HERMES_EXECUTABLE 환경변수: !HERMES_EXECUTABLE!
) else (
    where hermes >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%i in ('where hermes 2^>nul') do (
            set HERMES_EXE=%%i
            goto :found_in_path
        )
        :found_in_path
        echo [1] PATH에서 hermes 발견: !HERMES_EXE!
    ) else (
        set HERMES_DEFAULT=%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\hermes.exe
        if exist "!HERMES_DEFAULT!" (
            set HERMES_EXE=!HERMES_DEFAULT!
            set "PATH=%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts;%PATH%"
            echo [1] 알려진 위치에서 hermes 발견: !HERMES_EXE!
        ) else (
            echo [ERROR] hermes 실행 파일을 찾을 수 없습니다.
            echo         확인한 경로: %LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\hermes.exe
            echo         해결: HERMES_EXECUTABLE 환경변수 설정 또는 PATH 추가
            goto :fail
        )
    )
)

:: ── 버전 확인 ─────────────────────────────────────────────────────────────
echo.
echo [2] 버전 확인...
"!HERMES_EXE!" --version
if errorlevel 1 (
    echo [ERROR] hermes --version 실패. Hermes가 정상 설치됐는지 확인하세요.
    goto :fail
)

:: ── 로그인 상태 확인 ──────────────────────────────────────────────────────
echo.
echo [3] 로그인 상태 확인...
"!HERMES_EXE!" status
echo (위 출력에서 마케터 계정 확인. 필요하면 hermes login 또는 hermes profile use ^<프로필명^>)

:: ── 실제 테스트 쿼리 실행 ─────────────────────────────────────────────────
echo.
echo [4] 테스트 쿼리 실행 중 (hermes chat -q "..." --quiet --source erp-marketer-check)...
echo     응답:
"!HERMES_EXE!" chat -q "ERP marketer bridge check: 숫자 42를 말해줘." --quiet --source erp-marketer-check
if errorlevel 1 (
    echo [ERROR] 테스트 쿼리 실패. hermes status 로 로그인 상태를 확인하세요.
    goto :fail
)

echo.
echo ============================================================
echo [OK] 모든 점검 통과 — start_marketer.cmd 로 브릿지를 시작하세요.
echo ============================================================
goto :end

:fail
echo.
echo ============================================================
echo [FAIL] 점검 실패. 위 오류 메시지를 확인하세요.
echo ============================================================

:end
echo.
pause
endlocal
