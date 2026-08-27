"""
preflight.py — 브릿지 시작 전 Hermes CLI 사전 점검

브릿지(client.py) 최상단에서 호출:
  import preflight
  if not preflight.run():
      sys.exit(1)
"""
from __future__ import annotations

import logging
import sys

import hermes_cli

log = logging.getLogger("agent_bridge.preflight")


def run(agent_label: str = "bridge") -> bool:
    """
    Hermes CLI 사전 점검 실행. 실패 시 False 반환 (호출자가 exit).
    로그에 성공/실패 기록; 비밀값 미출력.
    """
    log.info(f"[사전점검] Hermes CLI 점검 시작 ({agent_label})")

    result = hermes_cli.check_hermes(source_tag=f"erp-{agent_label}-preflight")

    if not result["ok"]:
        log.error("=" * 60)
        log.error("[사전점검 실패] Hermes CLI 를 사용할 수 없습니다.")
        if result["exe"]:
            log.error(f"  실행 파일: {result['exe']}")
        log.error(f"  오류: {result['error']}")
        log.error("해결 방법:")
        log.error("  1. HERMES_EXECUTABLE 환경변수에 hermes.exe 전체 경로 지정")
        log.error("  2. check_hermes.cmd 또는 check_marketer.cmd 로 상세 진단")
        log.error("  3. hermes status 명령으로 로그인 상태 확인")
        log.error("=" * 60)
        return False

    log.info(f"[사전점검 통과] 실행 파일: {result['exe']}")
    log.info(f"[사전점검 통과] 버전: {result['version']}")
    log.info(f"[사전점검 통과] 테스트 응답 확인됨")
    return True
