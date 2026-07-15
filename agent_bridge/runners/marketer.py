"""
Marketer Runner
ERP Agent Bridge에서 호출. job.input을 받아 Claude API로 마케팅 관련 응답 생성.

사용 전 환경변수 필요:
  ANTHROPIC_API_KEY=sk-ant-...
"""
import os
from typing import Generator
from protocol import AgentJob

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

MARKETER_SYSTEM_PROMPT = """당신은 마케터 AI입니다. 마케팅 전략, 카피라이팅, SNS 콘텐츠 제작을 도와드립니다.
- 창의적이고 트렌디한 아이디어를 제안합니다.
- 한국 시장에 맞는 마케팅 전략을 추천합니다.
- 한국어로 소통합니다."""


def run(job: AgentJob) -> Generator[str, None, None]:
    """Claude API 스트리밍으로 마케팅 응답 생성."""
    if not ANTHROPIC_API_KEY:
        yield "⚠️ ANTHROPIC_API_KEY가 설정되지 않았습니다."
        return

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=MARKETER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": job.input}],
        ) as stream:
            for text in stream.text_stream:
                yield text

    except ImportError:
        import json, requests
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
                "system": MARKETER_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": job.input}],
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
