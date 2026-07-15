"""
Hermes Runner — hermes_cli 모듈 통해 Hermes chat CLI 호출.
Anthropic API 직접 호출 없음.

실제 명령: hermes chat -q <query> --quiet --source erp-hermes-bridge
"""
import os
import logging
import requests

from typing import Generator
from protocol import AgentJob
import hermes_cli

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
    실제 실행: hermes chat -q <query> --quiet --source erp-hermes-bridge
    """
    history = _get_history_text(job)
    query = f"{history}사용자: {job.input}" if history else job.input

    output = hermes_cli.run_chat(query, source="erp-hermes-bridge", timeout=180)
    yield output
