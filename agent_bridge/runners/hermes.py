"""
Hermes Runner — hermes chat CLI 사용 (구독 플랜·로그인 재사용)
Anthropic API 직접 호출 없음.

hermes chat -Q --query <입력> 를 subprocess 인수 배열로 실행.
쉘 문자열 보간 없음 → 명령 인젝션 불가.
"""
import os
import subprocess
import logging
import requests

from typing import Generator
from protocol import AgentJob

log = logging.getLogger("agent_bridge.hermes")

ERP_BASE_URL      = os.environ.get("ERP_BASE_URL", "")
ERP_AGENT_API_KEY = os.environ.get("ERP_AGENT_API_KEY", "")

_ERP_HEADERS = {
    "Authorization": f"Bearer {ERP_AGENT_API_KEY}",
    "Content-Type": "application/json",
}


def _get_history_text(job: AgentJob) -> str:
    """ERP에서 최근 대화 히스토리를 가져와 텍스트 블록으로 반환."""
    if not ERP_BASE_URL:
        return ""
    try:
        r = requests.get(
            f"{ERP_BASE_URL}/api/agent/messages/history",
            params={"agentType": "hermes", "userId": job.user_id, "limit": "10"},
            headers=_ERP_HEADERS,
            timeout=8,
        )
        if not r.ok:
            return ""
        messages = r.json().get("messages", [])
        if not messages:
            return ""
        lines = []
        for m in messages:
            role = "어시스턴트" if m.get("role") == "agent" else "사용자"
            lines.append(f"{role}: {m.get('content', '')}")
        return "\n".join(lines) + "\n\n"
    except Exception:
        return ""


def run(job: AgentJob) -> Generator[str, None, None]:
    """
    hermes chat CLI로 응답 생성.
    현재 로그인된 Hermes 구독 모델·프로필을 그대로 사용.
    """
    history = _get_history_text(job)
    query = f"{history}사용자: {job.input}" if history else job.input

    # 인수 배열: 쉘 인젝션 불가
    cmd = ["hermes", "chat", "-Q", "--query", query]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("hermes chat 응답 시간 초과 (120초)")
    except FileNotFoundError:
        raise RuntimeError(
            "hermes 명령을 찾을 수 없습니다. Hermes CLI가 PATH에 있는지 확인하세요."
        )

    if result.returncode != 0:
        # stderr에 인증 정보가 포함될 수 있으므로 원문 출력 금지
        raise RuntimeError(f"hermes chat 실패 (exit {result.returncode})")

    yield result.stdout.strip()
