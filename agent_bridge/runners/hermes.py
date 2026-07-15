"""
Hermes Runner
ERP Agent Bridge에서 호출. job.input을 받아 Claude API로 응답 생성.
chunks를 yield해 실시간 스트리밍.

사용 전 환경변수 필요:
  ANTHROPIC_API_KEY=sk-ant-...
  ERP_BASE_URL=https://erp-system-lojo.onrender.com
  ERP_AGENT_API_KEY=...
"""
import os
import requests
from typing import Generator
from protocol import AgentJob

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ERP_BASE_URL      = os.environ.get("ERP_BASE_URL", "https://erp-system-lojo.onrender.com")
ERP_AGENT_API_KEY = os.environ.get("ERP_AGENT_API_KEY", "")

HERMES_SYSTEM_PROMPT = """당신은 Hermes입니다. ERP 시스템을 관리하는 AI 어시스턴트입니다.
- 간결하고 명확하게 답변합니다.
- ERP 관련 작업(근태, 프로젝트, 재무, 시트 등)을 도움을 드립니다.
- 한국어로 소통합니다."""


def _get_context(job: AgentJob) -> list[dict]:
    """ERP에서 대화 히스토리와 메모리를 가져와 AI 컨텍스트 구성."""
    messages = []
    headers = {
        "Authorization": f"Bearer {ERP_AGENT_API_KEY}",
        "Content-Type": "application/json",
    }

    # 대화 히스토리
    try:
        r = requests.get(
            f"{ERP_BASE_URL}/api/agent/messages/history",
            params={"agentType": "hermes", "userId": job.user_id, "limit": "20"},
            headers=headers,
            timeout=10,
        )
        if r.ok:
            hist = r.json().get("messages", [])
            for m in hist:
                role = "assistant" if m.get("role") == "agent" else "user"
                messages.append({"role": role, "content": m.get("content", "")})
    except Exception:
        pass

    return messages


def run(job: AgentJob) -> Generator[str, None, None]:
    """Claude API 스트리밍으로 응답 생성."""
    if not ANTHROPIC_API_KEY:
        yield "⚠️ ANTHROPIC_API_KEY가 설정되지 않았습니다."
        return

    ctx_messages = _get_context(job)
    ctx_messages.append({"role": "user", "content": job.input})

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=HERMES_SYSTEM_PROMPT,
            messages=ctx_messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    except ImportError:
        # anthropic 패키지 없을 때 requests로 직접 호출
        import json
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 2048,
                "system": HERMES_SYSTEM_PROMPT,
                "messages": ctx_messages,
                "stream": True,
            },
            stream=True,
            timeout=60,
        )
        r.raise_for_status()
        for line in r.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8")
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    if data.get("type") == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "text_delta":
                            yield delta.get("text", "")
                except json.JSONDecodeError:
                    pass
