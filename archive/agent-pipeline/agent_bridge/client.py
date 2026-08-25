"""
ERP Agent Bridge Client  v2.0.0
────────────────────────────────────────────────────────────
동작 방식:
  1. 시작 시 /pending 으로 밀린 작업 한 번 복구
  2. SSE(/api/agent/sse?agentType=…) 로 실시간 작업 수신
  3. SSE 연결 끊김 → 지수 백오프 후 재연결 + /pending 재복구
  4. /pending 반복 호출 없음
  5. 운영 시간(08:00~01:00 KST) 외 → 슬립 후 자동 재연결
  6. 30초마다 하트비트
  7. 이미 accepted/processing 상태인 job은 건너뜀 (중복 실행 방지)
"""

import os
import sys
import time
import json
import socket
import logging
import threading
import importlib
from datetime import datetime, timezone, timedelta
from typing import Optional
import requests
from protocol import AgentJob, BACKOFF_STEPS, DEFAULT_OPEN_HOUR, DEFAULT_CLOSE_HOUR

# ─── 설정 ────────────────────────────────────────────────────────────────────

ERP_BASE_URL  = os.environ.get("ERP_BASE_URL", "").rstrip("/")
AGENT_API_KEY = os.environ.get("ERP_AGENT_API_KEY", "")
AGENT_TYPE    = os.environ.get("AGENT_TYPE", "hermes")
OPEN_HOUR     = int(os.environ.get("AGENT_OPEN_HOUR",  str(DEFAULT_OPEN_HOUR)))
CLOSE_HOUR    = int(os.environ.get("AGENT_CLOSE_HOUR", str(DEFAULT_CLOSE_HOUR)))
DRIVE_INDEX_SYNC_MINUTES = min(60, max(5, int(os.environ.get("DRIVE_INDEX_SYNC_MINUTES", "10"))))
VERSION       = "2.2.0"

KST = timezone(timedelta(hours=9))

if not ERP_BASE_URL:
    print("[FATAL] ERP_BASE_URL 환경변수가 없습니다.", file=sys.stderr)
    sys.exit(1)
if not AGENT_API_KEY:
    print("[FATAL] ERP_AGENT_API_KEY 환경변수가 없습니다.", file=sys.stderr)
    sys.exit(1)
if AGENT_TYPE not in ("hermes", "marketer"):
    print(f"[FATAL] AGENT_TYPE={AGENT_TYPE!r} — hermes 또는 marketer 이어야 합니다.", file=sys.stderr)
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("agent_bridge")

_BASE_HEADERS = {
    "Authorization": f"Bearer {AGENT_API_KEY}",
    "Content-Type": "application/json",
}

# ─── 운영 시간 ───────────────────────────────────────────────────────────────

def is_operating_hours() -> bool:
    h = datetime.now(KST).hour
    if OPEN_HOUR < CLOSE_HOUR:
        return OPEN_HOUR <= h < CLOSE_HOUR
    return h >= OPEN_HOUR or h < CLOSE_HOUR

def seconds_until_open() -> int:
    now = datetime.now(KST)
    h, m, s = now.hour, now.minute, now.second
    if OPEN_HOUR < CLOSE_HOUR:
        if h < OPEN_HOUR:
            return (OPEN_HOUR - h) * 3600 - m * 60 - s
    else:
        if CLOSE_HOUR <= h < OPEN_HOUR:
            return (OPEN_HOUR - h) * 3600 - m * 60 - s
    return 0

# ─── ERP API 헬퍼 ───────────────────────────────────────────────────────────

def api_get(path: str, params: Optional[dict] = None, timeout: int = 15) -> dict:
    r = requests.get(f"{ERP_BASE_URL}{path}", headers=_BASE_HEADERS,
                     params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()

def api_patch(path: str, data: dict, timeout: int = 15) -> dict:
    r = requests.patch(f"{ERP_BASE_URL}{path}", headers=_BASE_HEADERS,
                       json=data, timeout=timeout)
    r.raise_for_status()
    return r.json()

def api_post(path: str, data: dict, timeout: int = 15) -> dict:
    r = requests.post(f"{ERP_BASE_URL}{path}", headers=_BASE_HEADERS,
                      json=data, timeout=timeout)
    r.raise_for_status()
    return r.json()

# ─── 하트비트 (별도 스레드) ──────────────────────────────────────────────────

_hb_stop = threading.Event()

def _heartbeat_loop():
    while not _hb_stop.wait(timeout=30):
        # 운영 시간 외에는 heartbeat 전송 금지
        if not is_operating_hours():
            continue
        try:
            api_post("/api/agent/status", {
                "agentType": AGENT_TYPE,
                "version": VERSION,
                "hostname": socket.gethostname(),
            })
        except Exception as e:
            log.warning(f"하트비트 전송 실패: {e}")


def _drive_index_loop():
    """회사 Hermes PC에서만 Drive 변경분 색인을 주기적으로 요청한다."""
    if AGENT_TYPE != "hermes":
        return
    if _hb_stop.wait(timeout=20):
        return

    interval_seconds = DRIVE_INDEX_SYNC_MINUTES * 60
    while not _hb_stop.is_set():
        if is_operating_hours():
            try:
                response = requests.post(
                    f"{ERP_BASE_URL}/api/agent/drive-index/sync",
                    headers=_BASE_HEADERS,
                    json={},
                    timeout=120,
                )
                response.raise_for_status()
                result = response.json()
                if result.get("folders", 0) > 0:
                    log.info(
                        "Drive 색인: 스캔 %s, 변경 %s, 색인 %s, 다음 회차 %s",
                        result.get("scanned", 0),
                        result.get("changed", 0),
                        result.get("indexed", 0),
                        result.get("remaining", 0),
                    )
            except Exception as e:
                log.warning(f"Drive 색인 동기화 실패: {e}")
        if _hb_stop.wait(timeout=interval_seconds):
            return

# ─── 중복 실행 방지 ──────────────────────────────────────────────────────────

_active_jobs: set[str] = set()
_jobs_lock = threading.Lock()

def _try_claim(job_id: str) -> bool:
    """이미 처리 중이면 False, 새로 등록하면 True."""
    with _jobs_lock:
        if job_id in _active_jobs:
            return False
        _active_jobs.add(job_id)
        return True

def _release(job_id: str):
    with _jobs_lock:
        _active_jobs.discard(job_id)

# ─── 작업 처리 ───────────────────────────────────────────────────────────────

def process_job(job: AgentJob):
    if not _try_claim(job.job_id):
        log.debug(f"중복 건너뜀: {job.job_id}")
        return

    log.info(f"작업 시작: {job.job_id} (type={job.agent_type}, user={job.user_id})")
    try:
        _run_job(job)
    finally:
        _release(job.job_id)

def _run_job(job: AgentJob):
    # accepted
    try:
        api_patch(f"/api/agent/jobs/{job.job_id}", {"status": "accepted"})
    except Exception as e:
        log.error(f"accepted 전환 실패: {e}")
        return

    # processing
    try:
        api_patch(f"/api/agent/jobs/{job.job_id}", {"status": "processing"})
    except Exception as e:
        log.error(f"processing 전환 실패: {e}")
        return

    try:
        module = importlib.import_module(f"runners.{job.agent_type}")
        runner_fn = getattr(module, "run")
    except (ModuleNotFoundError, AttributeError) as e:
        log.error(f"Runner 로드 실패 ({job.agent_type}): {e}")
        _mark_error(job.job_id, f"Runner not found: {e}")
        return

    full_output = ""
    seq = 0
    try:
        for chunk in runner_fn(job):
            full_output += chunk
            try:
                api_post(f"/api/agent/jobs/{job.job_id}/delta", {"seq": seq, "content": chunk})
            except Exception as e:
                log.warning(f"delta 전송 실패 seq={seq}: {e}")
            seq += 1

        api_patch(f"/api/agent/jobs/{job.job_id}", {
            "status": "completed",
            "output": full_output,
        })
        log.info(f"작업 완료: {job.job_id} ({seq} chunks, {len(full_output)}자)")
    except Exception as e:
        log.error(f"Runner 실행 오류: {e}", exc_info=True)
        _mark_error(job.job_id, str(e)[:500])

def _mark_error(job_id: str, msg: str):
    try:
        api_patch(f"/api/agent/jobs/{job_id}", {"status": "error", "errorMsg": msg})
    except Exception as e2:
        log.error(f"error 전환 실패: {e2}")

# ─── pending 복구 (시작·재연결 시 1회) ──────────────────────────────────────

def recover_pending():
    """서버에 남은 pending 작업을 가져와 처리. 별도 스레드로 실행."""
    try:
        data = api_get("/api/agent/jobs/pending", {"agentType": AGENT_TYPE, "limit": "10"})
        jobs = data.get("jobs", [])
        if jobs:
            log.info(f"pending 복구: {len(jobs)}개")
        for j in jobs:
            job = AgentJob(
                job_id=j["id"],
                agent_type=j["agentType"],
                user_id=j["userId"],
                input=j["input"],
                status=j["status"],
            )
            t = threading.Thread(target=process_job, args=(job,), daemon=True)
            t.start()
    except Exception as e:
        log.warning(f"pending 복구 실패 (무시): {e}")

# ─── SSE 연결 루프 ───────────────────────────────────────────────────────────

def _parse_sse_line(line: str) -> tuple[Optional[str], Optional[str]]:
    """'event: xxx' 또는 'data: xxx' 파싱."""
    if line.startswith("event:"):
        return "event", line[6:].strip()
    if line.startswith("data:"):
        return "data", line[5:].strip()
    return None, None


def _iter_sse_lines(resp):
    # requests defaults text/event-stream without a charset to ISO-8859-1.
    # UTF-8 Korean bytes can decode to control characters that split a JSON
    # data line in the middle, so force the server's actual encoding.
    resp.encoding = "utf-8"
    return resp.iter_lines(decode_unicode=True)

def sse_loop():
    """SSE 스트림에 연결해 job 이벤트를 실시간 수신. 끊기면 백오프 후 재연결."""
    backoff_idx = 0
    sse_url = f"{ERP_BASE_URL}/api/agent/sse/bridge?agentType={AGENT_TYPE}"

    while True:
        if not is_operating_hours():
            secs = seconds_until_open()
            wake_in = min(secs + 30, 3600)  # 최대 1시간, 실제 개시 30초 후 재연결
            log.info(
                f"운영 시간 외 ({CLOSE_HOUR:02d}:00~{OPEN_HOUR:02d}:00). "
                f"{secs // 3600}시간 {(secs % 3600) // 60}분 후 재연결 (슬립 {wake_in}초)"
            )
            time.sleep(wake_in)
            continue

        log.info(f"SSE 연결 시도: {sse_url}")
        try:
            # pending 복구를 연결 직전에 실행
            threading.Thread(target=recover_pending, daemon=True).start()

            with requests.get(
                sse_url,
                headers=_BASE_HEADERS,
                stream=True,
                timeout=(10, 300),  # (connect, read)
            ) as resp:
                resp.raise_for_status()
                log.info("SSE 연결됨")
                backoff_idx = 0

                event_type = None
                for raw_line in _iter_sse_lines(resp):
                    if raw_line is None:
                        continue
                    field, val = _parse_sse_line(raw_line)
                    if field == "event":
                        event_type = val
                    elif field == "data" and val:
                        if event_type == "job":
                            try:
                                j = json.loads(val)
                                job = AgentJob(
                                    job_id=j["jobId"],
                                    agent_type=j["agentType"],
                                    user_id=j["userId"],
                                    input=j["input"],
                                    status="pending",
                                )
                                threading.Thread(
                                    target=process_job, args=(job,), daemon=True
                                ).start()
                            except Exception as e:
                                log.warning(f"SSE job 파싱 오류: {e}")
                        elif event_type == "ping":
                            pass  # keep-alive
                        event_type = None

        except requests.exceptions.ReadTimeout:
            log.warning("SSE read timeout — 재연결")
        except requests.exceptions.ConnectionError as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.warning(f"SSE 연결 오류 (재시도 {delay}초): {e}")
            time.sleep(delay)
            backoff_idx = min(backoff_idx + 1, len(BACKOFF_STEPS) - 1)
        except requests.exceptions.HTTPError as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.warning(f"SSE HTTP 오류 (재시도 {delay}초): {e}")
            time.sleep(delay)
            backoff_idx = min(backoff_idx + 1, len(BACKOFF_STEPS) - 1)
        except Exception as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.error(f"SSE 예외 (재시도 {delay}초): {e}", exc_info=True)
            time.sleep(delay)
            backoff_idx = min(backoff_idx + 1, len(BACKOFF_STEPS) - 1)

# ─── 메인 ────────────────────────────────────────────────────────────────────

def main():
    log.info(f"ERP Agent Bridge v{VERSION} (type={AGENT_TYPE})")
    log.info(f"서버: {ERP_BASE_URL}")
    log.info(f"운영 시간: {OPEN_HOUR:02d}:00 ~ {CLOSE_HOUR:02d}:00 KST")

    # 하트비트 스레드
    hb_thread = threading.Thread(target=_heartbeat_loop, daemon=True)
    hb_thread.start()

    # 회사 Hermes만 10분 단위 Drive 변경분 색인. Marketer 브릿지는 호출하지 않는다.
    if AGENT_TYPE == "hermes":
        drive_index_thread = threading.Thread(target=_drive_index_loop, daemon=True)
        drive_index_thread.start()

    # SSE 메인 루프 (블로킹)
    try:
        sse_loop()
    except KeyboardInterrupt:
        log.info("종료 요청 (Ctrl+C)")
    finally:
        _hb_stop.set()


if __name__ == "__main__":
    main()
