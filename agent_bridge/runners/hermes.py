"""
Hermes Runner — hermes_cli 모듈 통해 Hermes chat CLI 호출.
Anthropic API 직접 호출 없음.

실제 명령: hermes chat -q <query> --quiet --source erp-hermes-bridge
"""
import os
import json
import logging
import re
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

_SHEET_CREATE_PATTERNS = (
    re.compile(r"(시트|스프레드시트).{0,30}(만들어|만들어줘|생성해|생성해줘|작성해|작성해줘)", re.I),
    re.compile(r"(만들어|만들어줘|생성해|생성해줘|작성해|작성해줘).{0,30}(시트|스프레드시트)", re.I),
    re.compile(r"\b(create|make|build)\b.{0,40}\b(spreadsheet|google sheet)\b", re.I),
)

_SHEET_ERROR_MESSAGES = {
    "INVALID_AGENT_TYPE": "에이전트 유형이 유효하지 않아 시트를 생성하지 않았습니다.",
    "INVALID_FOLDER_NAME": "저장 폴더 이름이 유효하지 않아 시트를 생성하지 않았습니다.",
    "INVALID_TITLE": "시트 제목이 유효하지 않아 시트를 생성하지 않았습니다.",
    "INVALID_TABS": "시트 탭 구성이 유효하지 않아 생성하지 않았습니다.",
    "INITIAL_DATA_TOO_LARGE": "초기 데이터가 허용 크기를 초과해 시트를 생성하지 않았습니다.",
    "UNAUTHORIZED": "시트 생성 권한 인증이 거부되었습니다. 브릿지 API 키 설정을 확인해 주세요.",
    "GOOGLE_AUTH_EXPIRED": "Google Drive 인증이 만료되어 시트를 생성하지 못했습니다. 관리자의 Drive 재인증이 필요합니다.",
    "DRIVE_ROOT_FOLDER_FAILED": "Google Drive 루트 폴더 단계에서 실패해 시트를 생성하지 못했습니다.",
    "DRIVE_SUBFOLDER_FAILED": "Google Drive 하위 폴더 단계에서 실패해 시트를 생성하지 못했습니다.",
    "DRIVE_FILE_CREATE_FAILED": "Google Drive 파일 생성 단계에서 실패했습니다.",
    "SHEET_CONFIGURE_TABS_FAILED": "시트 파일은 생성됐지만 탭 구성 단계에서 실패했습니다.",
    "SHEET_WRITE_DATA_FAILED": "시트 파일은 생성됐지만 초기 데이터 입력 단계에서 실패했습니다.",
    "SPREADSHEET_CREATE_FAILED": "Google 스프레드시트 생성 중 오류가 발생했습니다.",
    "SHEET_EXECUTOR_UNREACHABLE": "시트 실행 API에 연결하지 못해 생성 여부를 확인할 수 없습니다.",
    "SHEET_PLAN_INVALID": "시트 생성 요청을 안전한 작업 형식으로 변환하지 못해 실제 생성은 하지 않았습니다.",
}


class SheetActionError(RuntimeError):
    def __init__(self, code: str, *, status: int | None = None, url: str = ""):
        super().__init__(code)
        self.code = code
        self.status = status
        self.url = url


def _is_sheet_creation_request(text: str) -> bool:
    normalized = str(text or "").strip()
    return any(pattern.search(normalized) for pattern in _SHEET_CREATE_PATTERNS)


def _build_sheet_plan_query(job: AgentJob, context: dict) -> str:
    verified_data = context.get("data") or {}
    return "\n".join([
        "다음 ERP 사용자 요청을 Google 스프레드시트 생성 작업으로 구조화한다.",
        "반드시 JSON 객체 하나만 출력하고 Markdown 코드블록이나 설명은 쓰지 않는다.",
        '스키마: {"action":"create_spreadsheet","arguments":{"title":"제목","tabs":["탭"],"data":{"탭":[["셀"]]}}}',
        "규칙:",
        "- action은 create_spreadsheet로 고정한다.",
        "- title은 요청에서 가장 짧고 명확하게 정한다.",
        "- tabs는 1~10개, 각 탭 이름은 중복 없이 정한다.",
        "- data에는 요청 또는 아래 검증된 ERP 자료에 실제로 있는 값만 넣는다.",
        "- 자료에 없는 값은 만들거나 추측하지 않는다.",
        "- 데이터가 없으면 data는 빈 객체로 둔다.",
        "[서버가 검증한 ERP 자료]",
        json.dumps(verified_data, ensure_ascii=False, default=str),
        "[사용자 요청]",
        job.input,
    ])


def _parse_sheet_plan(raw_output: str, job: AgentJob) -> dict:
    text = str(raw_output or "").strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise SheetActionError("SHEET_PLAN_INVALID")

    try:
        payload = json.loads(text[start:end + 1])
    except (TypeError, ValueError) as exc:
        raise SheetActionError("SHEET_PLAN_INVALID") from exc

    if not isinstance(payload, dict) or payload.get("action") != "create_spreadsheet":
        raise SheetActionError("SHEET_PLAN_INVALID")
    raw_args = payload.get("arguments")
    if not isinstance(raw_args, dict):
        raise SheetActionError("SHEET_PLAN_INVALID")

    title = str(raw_args.get("title") or "").strip()[:100]
    if not title:
        raise SheetActionError("SHEET_PLAN_INVALID")

    raw_tabs = raw_args.get("tabs", ["Sheet1"])
    if not isinstance(raw_tabs, list):
        raise SheetActionError("SHEET_PLAN_INVALID")
    tabs: list[str] = []
    for value in raw_tabs:
        tab = str(value or "").strip()[:100]
        if tab and tab not in tabs:
            tabs.append(tab)
    if not 1 <= len(tabs) <= 10:
        raise SheetActionError("SHEET_PLAN_INVALID")

    raw_data = raw_args.get("data") or {}
    if not isinstance(raw_data, dict):
        raise SheetActionError("SHEET_PLAN_INVALID")

    data: dict[str, list[list[str]]] = {}
    total_cells = 0
    for tab, raw_rows in raw_data.items():
        tab_name = str(tab or "").strip()
        if tab_name not in tabs or not isinstance(raw_rows, list):
            continue
        rows: list[list[str]] = []
        for raw_row in raw_rows[:500]:
            if not isinstance(raw_row, list):
                continue
            row = [str(cell if cell is not None else "") for cell in raw_row[:26]]
            total_cells += len(row)
            rows.append(row)
        if rows:
            data[tab_name] = rows
    if total_cells > 13000:
        raise SheetActionError("SHEET_PLAN_INVALID")

    return {
        "agentType": job.agent_type,
        "title": title,
        "sourcePrompt": job.input,
        "tabs": tabs,
        "data": data,
    }


def _execute_sheet_plan(plan: dict) -> dict:
    try:
        response = requests.post(
            f"{ERP_BASE_URL}/api/agent/sheets/create",
            headers=_ERP_HEADERS,
            json=plan,
            timeout=90,
        )
    except requests.RequestException as exc:
        raise SheetActionError("SHEET_EXECUTOR_UNREACHABLE") from exc

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    if response.status_code == 201:
        url = str(payload.get("url") or "").strip()
        if not url.startswith("https://docs.google.com/spreadsheets/"):
            raise SheetActionError("SPREADSHEET_CREATE_FAILED", status=response.status_code)
        return payload

    code = str(payload.get("code") or f"HTTP_{response.status_code}")
    url = str(payload.get("url") or "").strip()
    raise SheetActionError(code, status=response.status_code, url=url)


def _format_sheet_error(error: SheetActionError) -> str:
    message = _SHEET_ERROR_MESSAGES.get(
        error.code,
        f"시트 생성 API가 오류를 반환했습니다 (HTTP {error.status or 'unknown'}).",
    )
    suffix = f"\n오류 코드: {error.code}"
    if error.url.startswith("https://docs.google.com/spreadsheets/"):
        suffix += f"\n생성된 파일: {error.url}"
    return message + suffix


def _run_sheet_creation(job: AgentJob, context: dict) -> str:
    try:
        planning_query = _build_sheet_plan_query(job, context)
        raw_plan = hermes_cli.run_chat(
            planning_query,
            source="erp-hermes-sheet-planner",
            timeout=180,
        )
        plan = _parse_sheet_plan(raw_plan, job)
        result = _execute_sheet_plan(plan)
    except SheetActionError as error:
        log.warning(
            "Structured sheet action failed: code=%s status=%s",
            error.code,
            error.status,
        )
        return _format_sheet_error(error)

    title = str(result.get("title") or plan["title"])
    folder_path = str(result.get("folderPath") or "")
    url = str(result["url"])
    return f"시트를 생성했습니다.\n- 제목: {title}\n- 위치: {folder_path}\n- 링크: {url}"


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
    if _is_sheet_creation_request(job.input):
        yield _run_sheet_creation(job, context)
        return

    query = _build_query(job, context)

    output = hermes_cli.run_chat(query, source="erp-hermes-bridge", timeout=180)
    yield _append_sources(output, context)
