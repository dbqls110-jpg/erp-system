"""
hermes_cli.py — Hermes CLI 실행 공통 모듈

실제 동작이 확인된 명령 형식:
  hermes chat -q <query> --quiet --source <source>

참조: erp_marketer_message_polling.py (기존 동작 폴링 파일)
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional

# ─── 알려진 Hermes 실행 파일 위치 (Windows) ──────────────────────────────────

_KNOWN_LOCATIONS: list[Path] = [
    Path.home() / "AppData" / "Local" / "hermes" / "hermes-agent" / "venv" / "Scripts" / "hermes.exe",
    Path.home() / "AppData" / "Local" / "hermes" / "bin" / "hermes.exe",
    Path.home() / "AppData" / "Local" / "hermes" / "bin" / "hermes",
]


def find_hermes_exe() -> str:
    """
    Hermes 실행 파일 경로를 반환. 다음 순서로 탐색:
      1. HERMES_EXECUTABLE 환경변수 (명시적 지정)
      2. PATH 내 hermes
      3. 알려진 설치 위치

    찾지 못하면 RuntimeError.
    """
    explicit = os.environ.get("HERMES_EXECUTABLE", "").strip()
    if explicit:
        if not os.path.isfile(explicit):
            raise RuntimeError(
                f"HERMES_EXECUTABLE 경로가 존재하지 않습니다: {explicit}"
            )
        return explicit

    found = shutil.which("hermes")
    if found:
        return found

    for p in _KNOWN_LOCATIONS:
        if p.exists():
            return str(p)

    locations = "\n  ".join(str(p) for p in _KNOWN_LOCATIONS)
    raise RuntimeError(
        "hermes 실행 파일을 찾을 수 없습니다.\n"
        "해결 방법:\n"
        "  1. HERMES_EXECUTABLE 환경변수에 hermes.exe 전체 경로 지정\n"
        "  2. Hermes 설치 경로를 PATH에 추가\n"
        f"확인한 위치:\n  {locations}"
    )


def sanitize_output(text: str) -> str:
    """ANSI 이스케이프 제거 후 공백 정리."""
    text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
    return text.strip()


def run_chat(
    query: str,
    source: str,
    timeout: int = 180,
    child_env: Optional[dict] = None,
) -> str:
    """
    hermes chat -q <query> --quiet --source <source> 를 실행하고 응답을 반환.

    - shell=False: 인수 배열 방식 (명령 인젝션 불가)
    - ERP_* 자격증명은 자식 프로세스에 전달하지 않음
    - 응답은 stdout, session_id는 stderr (무시)
    - encoding='utf-8': 한국어 출력 보장
    """
    exe = find_hermes_exe()

    # ERP 자격증명 격리: 자식 프로세스에 ERP_* 변수 미전달 (보안)
    env = (child_env or os.environ).copy()
    for k in list(env):
        if k.startswith("ERP_"):
            env.pop(k, None)

    cmd = [exe, "chat", "-q", query, "--quiet", "--source", source]

    try:
        proc = subprocess.run(
            cmd,
            text=True,
            capture_output=True,
            timeout=timeout,
            encoding="utf-8",
            env=env,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"hermes chat 응답 시간 초과 ({timeout}초)")
    except FileNotFoundError:
        raise RuntimeError(
            f"hermes 실행 파일을 실행할 수 없습니다: {exe}"
        )

    if proc.returncode != 0:
        # stderr에 인증 정보가 포함될 수 있으므로 원문 미출력
        raise RuntimeError(
            f"hermes chat 종료 코드 {proc.returncode}"
        )

    output = sanitize_output(proc.stdout)
    return output or "처리 결과를 생성하지 못했습니다."


def check_hermes(source_tag: str = "erp-bridge-preflight") -> dict:
    """
    Hermes CLI 사전 점검:
      - 실행 파일 존재 확인
      - 버전 확인
      - 테스트 쿼리 실행

    반환: {"ok": bool, "exe": str, "version": str, "test_response": str, "error": str}
    """
    result: dict = {"ok": False, "exe": "", "version": "", "test_response": "", "error": ""}

    try:
        exe = find_hermes_exe()
        result["exe"] = exe
    except RuntimeError as e:
        result["error"] = str(e)
        return result

    # 버전 확인
    try:
        ver_proc = subprocess.run(
            [exe, "--version"],
            text=True,
            capture_output=True,
            timeout=10,
            encoding="utf-8",
        )
        version_text = (ver_proc.stdout or ver_proc.stderr or "").strip()
        result["version"] = version_text.split("\n")[0] if version_text else "unknown"
    except Exception as e:
        result["error"] = f"버전 확인 실패: {e}"
        return result

    # 무해한 테스트 쿼리
    try:
        response = run_chat(
            query="ERP bridge preflight check. Reply with exactly: OK",
            source=source_tag,
            timeout=60,
        )
        result["test_response"] = response[:100]
        result["ok"] = True
    except RuntimeError as e:
        result["error"] = f"테스트 쿼리 실패: {e}"

    return result
