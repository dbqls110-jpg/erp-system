"""
Hermes Runner — hermes_cli 모듈 통해 Hermes chat CLI 호출.
Anthropic API 직접 호출 없음.

실제 명령: hermes chat -q <query> --quiet --source erp-hermes-bridge
"""
import os
import json
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


def _get_job_context(job: AgentJob) -> dict:
    """작업에 묶인 요청자, 관련 ERP 데이터, 대화 이력과 출처를 한 번에 조회."""
    if not ERP_BASE_URL:
        return {}
    try:
        r = requests.get(
            f"{ERP_BASE_URL}/api/agent/jobs/{job.job_id}/context",
            headers=_ERP_HEADERS,
            timeout=12,
        )
        if not r.ok:
            log.warning("ERP 작업 컨텍스트 조회 실패: HTTP %s", r.status_code)
            return {}
        payload = r.json()
        return payload if isinstance(payload, dict) else {}
    except Exception:
        log.warning("ERP 작업 컨텍스트 조회 중 오류", exc_info=True)
        return {}


def _build_query(job: AgentJob, context: dict) -> str:
    requester = context.get("requester") or {}
    history = context.get("history") or []
    verified_data = context.get("data") or {}

    history_lines = []
    for message in history:
        role = "어시스턴트" if message.get("role") == "agent" else "사용자"
        history_lines.append(f"{role}: {message.get('content', '')}")

    blocks = [
        "[ERP 요청 컨텍스트 - 서버 검증 완료]",
        f"요청자: {requester.get('name') or '이름 없음'} "
        f"(ERP userId={requester.get('id') or job.user_id}, role={requester.get('role') or 'unknown'})",
        "'나/내/저/제'는 반드시 위 요청자를 뜻한다. Hermes 에이전트 계정으로 바꾸지 않는다.",
    ]
    if verified_data:
        blocks.extend([
            "아래 ERP 데이터는 이 작업의 요청자 권한과 질문 주제에 맞춰 서버가 미리 조회한 최신 자료다.",
            "해당 자료로 답할 수 있으면 ERP API를 다시 호출하지 말고 즉시 답한다.",
            "자료에 없는 값은 추측하지 말고 확인할 수 없다고 밝힌다.",
            json.dumps(verified_data, ensure_ascii=False, default=str),
        ])
    if history_lines:
        blocks.extend(["[최근 대화]", "\n".join(history_lines)])
    blocks.extend([
        "[현재 질문]",
        job.input,
        "답변 본문만 작성한다. 출처 목록은 브릿지가 자동으로 붙이므로 직접 만들지 않는다.",
    ])
    return "\n".join(blocks)


def _append_sources(output: str, context: dict) -> str:
    sources = context.get("sources") or []
    if not sources:
        return output

    lines = ["", "출처"]
    for source in sources:
        label = str(source.get("label") or "ERP 자료")
        url = str(source.get("url") or "").strip()
        count = source.get("recordCount")
        suffix = f" ({count}건 기준)" if isinstance(count, int) else ""
        if url.startswith(("https://", "http://")):
            lines.append(f"- {label}{suffix}: {url}")
    return output.rstrip() + "\n" + "\n".join(lines) if len(lines) > 2 else output


def run(job: AgentJob) -> Generator[str, None, None]:
    """
    hermes chat CLI로 응답 생성.
    현재 로그인된 Hermes 구독 모델·프로필을 그대로 사용.
    실제 실행: hermes chat -q <query> --quiet --source erp-hermes-bridge
    """
    context = _get_job_context(job)
    query = _build_query(job, context)

    output = hermes_cli.run_chat(query, source="erp-hermes-bridge", timeout=180)
    yield _append_sources(output, context)
