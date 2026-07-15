"""
Marketer Runner — hermes chat CLI 사용 (노트북 구독 플랜·로그인 재사용)
Anthropic API 직접 호출 없음.

노트북에서 `hermes profile use <marketer-profile>` 로 프로필을 설정한 뒤 실행.
hermes chat -Q --query <입력> 를 subprocess 인수 배열로 실행.
쉘 문자열 보간 없음 → 명령 인젝션 불가.
"""
import subprocess
import logging

from typing import Generator
from protocol import AgentJob

log = logging.getLogger("agent_bridge.marketer")


def run(job: AgentJob) -> Generator[str, None, None]:
    """
    hermes chat CLI로 마케팅 응답 생성.
    노트북에 설정된 Hermes 프로필·구독 모델을 그대로 사용.
    """
    cmd = ["hermes", "chat", "-Q", "--query", job.input]

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
        raise RuntimeError(f"hermes chat 실패 (exit {result.returncode})")

    yield result.stdout.strip()
