"""
Marketer Runner — hermes_cli 모듈 통해 Hermes chat CLI 호출.
Anthropic API 직접 호출 없음.

노트북에서 `hermes profile use <marketer-profile>` 로 프로필 설정 후 실행.
실제 명령: hermes chat -q <query> --quiet --source erp-marketer-bridge
"""
import logging

from typing import Generator
from protocol import AgentJob
import hermes_cli

log = logging.getLogger("agent_bridge.marketer")


def run(job: AgentJob) -> Generator[str, None, None]:
    """
    hermes chat CLI로 마케팅 응답 생성.
    노트북에 설정된 Hermes 프로필·구독 모델을 그대로 사용.
    실제 실행: hermes chat -q <query> --quiet --source erp-marketer-bridge
    """
    output = hermes_cli.run_chat(job.input, source="erp-marketer-bridge", timeout=180)
    yield output
