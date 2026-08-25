@echo off
if not defined ERP_UTF8_RELAUNCHED (
    chcp 65001 >nul
    set ERP_UTF8_RELAUNCHED=1
    cmd /c "%~f0" %*
    exit /b %errorlevel%
)
setlocal enabledelayedexpansion
:: ─────────────────────────────────────────────────────────
:: ERP Hermes Bridge — 설치 확인 스크립트 (가시적 창)
:: 브릿지 실행 전 한 번 실행해 Hermes CLI 상태를 점검하세요.
:: ─────────────────────────────────────────────────────────
cd /d "%~dp0"
echo ============================================================
echo  ERP Hermes Bridge — 설치 확인 (check_hermes)
echo ============================================================
echo.

:: ── Hermes 실행 파일 탐색 ──────────────────────────────────────────────────
set HERMES_EXE=
if defined HERMES_EXECUTABLE goto :use_env_executable

where hermes >nul 2>&1
if errorlevel 1 goto :try_default_location

for /f "delims=" %%i in ('where hermes 2^>nul') do set HERMES_EXE=%%i
echo [1] PATH에서 hermes 발견: !HERMES_EXE!
goto :hermes_found

:use_env_executable
set HERMES_EXE=!HERMES_EXECUTABLE!
echo [1] HERMES_EXECUTABLE 환경변수: !HERMES_EXECUTABLE!
goto :hermes_found

:try_default_location
set HERMES_DEFAULT=%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\hermes.exe
if not exist "!HERMES_DEFAULT!" goto :hermes_not_found
set HERMES_EXE=!HERMES_DEFAULT!
set "PATH=%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts;%PATH%"
echo [1] 알려진 위치에서 hermes 발견: !HERMES_EXE!
goto :hermes_found

:hermes_not_found
echo [ERROR] hermes 실행 파일을 찾을 수 없습니다.
echo         확인한 경로: %LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts\hermes.exe
echo         해결: HERMES_EXECUTABLE 환경변수 설정 또는 PATH 추가
goto :fail

:hermes_found

:: ── 버전 확인 ─────────────────────────────────────────────────────────────
echo.
echo [2] 버전 확인...
"!HERMES_EXE!" --version
if errorlevel 1 echo [ERROR] hermes --version 실패. Hermes가 정상 설치됐는지 확인하세요.
if errorlevel 1 goto :fail

:: ── 로그인 상태 확인 ──────────────────────────────────────────────────────
echo.
echo [3] 로그인 상태 확인...
"!HERMES_EXE!" status
echo (위 출력에서 로그인 계정 확인. 로그인 안 됐으면: hermes login)

:: ── 실제 테스트 쿼리 실행 ─────────────────────────────────────────────────
echo.
echo [4] 테스트 쿼리 실행 중 (hermes chat -q "..." --quiet --source erp-hermes-check)...
echo     응답:
"!HERMES_EXE!" chat -q "ERP bridge check: 숫자 42를 말해줘." --quiet --source erp-hermes-check
if errorlevel 1 echo [ERROR] 테스트 쿼리 실패. hermes status 로 로그인 상태를 확인하세요.
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo [OK] 모든 점검 통과 — start_hermes.cmd 로 브릿지를 시작하세요.
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
