"""
ERP Agent Bridge Client
- ERP 서버에 HTTP 폴링으로 미처리 작업(AgentJob)을 가져와 실행
- 실행 중 delta를 스트리밍으로 전송
- 운영 시간(08:00~01:00 KST) 외에는 대기
- 지수 백오프: 5, 15, 30, 60, 120, 300초
"""
import os
import sys
import time
import socket
import logging
import importlib
from datetime import datetime, timezone, timedelta
from typing import Optional
import requests
from protocol import AgentJob, DeltaChunk, BACKOFF_STEPS, DEFAULT_OPEN_HOUR, DEFAULT_CLOSE_HOUR

# ─── 설정 ────────────────────────────────────────────────────────────────────

ERP_BASE_URL  = os.environ.get("ERP_BASE_URL", "https://erp-system-lojo.onrender.com")
AGENT_API_KEY = os.environ.get("ERP_AGENT_API_KEY", "")
AGENT_TYPE    = os.environ.get("AGENT_TYPE", "hermes")
OPEN_HOUR     = int(os.environ.get("AGENT_OPEN_HOUR",  str(DEFAULT_OPEN_HOUR)))
CLOSE_HOUR    = int(os.environ.get("AGENT_CLOSE_HOUR", str(DEFAULT_CLOSE_HOUR)))
POLL_INTERVAL = int(os.environ.get("AGENT_POLL_INTERVAL", "3"))  # seconds
VERSION       = "1.0.0"

KST = timezone(timedelta(hours=9))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("agent_bridge")

HEADERS = {
    "Authorization": f"Bearer {AGENT_API_KEY}",
    "Content-Type": "application/json",
}

# ─── 운영 시간 확인 ──────────────────────────────────────────────────────────

def is_operating_hours() -> bool:
    now = datetime.now(KST)
    h = now.hour
    if OPEN_HOUR < CLOSE_HOUR:
        return OPEN_HOUR <= h < CLOSE_HOUR
    else:
        # 자정 넘어가는 케이스: 08:00 ~ 익일 01:00
        return h >= OPEN_HOUR or h < CLOSE_HOUR

def minutes_until_open() -> int:
    now = datetime.now(KST)
    h, m = now.hour, now.minute
    if h < OPEN_HOUR:
        return (OPEN_HOUR - h) * 60 - m
    return (24 - h + OPEN_HOUR) * 60 - m

# ─── ERP API 헬퍼 ───────────────────────────────────────────────────────────

def api_get(path: str, params: Optional[dict] = None):
    r = requests.get(f"{ERP_BASE_URL}{path}", headers=HEADERS, params=params, timeout=15)
    r.raise_for_status()
    return r.json()

def api_patch(path: str, data: dict):
    r = requests.patch(f"{ERP_BASE_URL}{path}", headers=HEADERS, json=data, timeout=15)
    r.raise_for_status()
    return r.json()

def api_post(path: str, data: dict):
    r = requests.post(f"{ERP_BASE_URL}{path}", headers=HEADERS, json=data, timeout=15)
    r.raise_for_status()
    return r.json()

# ─── 하트비트 ───────────────────────────────────────────────────────────────

def send_heartbeat():
    try:
        api_post("/api/agent/status", {
            "agentType": AGENT_TYPE,
            "version": VERSION,
            "hostname": socket.gethostname(),
        })
    except Exception as e:
        log.warning(f"하트비트 전송 실패: {e}")

# ─── 작업 처리 ───────────────────────────────────────────────────────────────

def process_job(job: AgentJob):
    log.info(f"작업 수락: {job.job_id} (type={job.agent_type}, user={job.user_id})")

    # accepted
    try:
        api_patch(f"/api/agent/jobs/{job.job_id}", {"status": "accepted"})
    except Exception as e:
        log.error(f"accepted 업데이트 실패: {e}")
        return

    # processing
    try:
        api_patch(f"/api/agent/jobs/{job.job_id}", {"status": "processing"})
    except Exception as e:
        log.error(f"processing 업데이트 실패: {e}")
        return

    # runner 호출
    try:
        module = importlib.import_module(f"runners.{job.agent_type}")
        runner_fn = getattr(module, "run")
    except (ModuleNotFoundError, AttributeError) as e:
        log.error(f"Runner 로드 실패 ({job.agent_type}): {e}")
        api_patch(f"/api/agent/jobs/{job.job_id}", {
            "status": "error",
            "errorMsg": f"Runner not found: {e}",
        })
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
        log.info(f"작업 완료: {job.job_id} ({seq} chunks)")
    except Exception as e:
        log.error(f"Runner 실행 오류: {e}")
        api_patch(f"/api/agent/jobs/{job.job_id}", {
            "status": "error",
            "errorMsg": str(e)[:500],
        })

# ─── 메인 루프 ──────────────────────────────────────────────────────────────

def main():
    if not AGENT_API_KEY:
        log.critical("ERP_AGENT_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        sys.exit(1)

    log.info(f"ERP Agent Bridge 시작 (type={AGENT_TYPE}, base={ERP_BASE_URL})")
    log.info(f"운영 시간: {OPEN_HOUR:02d}:00 ~ {CLOSE_HOUR:02d}:00 KST")

    backoff_idx = 0
    heartbeat_interval = 30  # seconds
    last_hb = 0.0

    while True:
        now = time.time()

        # 하트비트 (30초마다)
        if now - last_hb >= heartbeat_interval:
            send_heartbeat()
            last_hb = now

        # 운영 시간 체크
        if not is_operating_hours():
            wait_min = minutes_until_open()
            log.info(f"운영 시간 외. {wait_min}분 후 재개 (다음 {OPEN_HOUR:02d}:00 KST)")
            time.sleep(min(wait_min * 60, 600))
            continue

        try:
            data = api_get("/api/agent/jobs/pending", {"agentType": AGENT_TYPE, "limit": "3"})
            jobs = data.get("jobs", [])

            if jobs:
                backoff_idx = 0
                for j in jobs:
                    job = AgentJob(
                        job_id=j["id"],
                        agent_type=j["agentType"],
                        user_id=j["userId"],
                        input=j["input"],
                        status=j["status"],
                        created_at=j.get("createdAt"),
                    )
                    process_job(job)
            else:
                # 작업 없음 → 폴 인터벌 대기
                time.sleep(POLL_INTERVAL)

        except requests.exceptions.ConnectionError as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.warning(f"연결 오류 (재시도 {delay}초): {e}")
            time.sleep(delay)
            backoff_idx = min(backoff_idx + 1, len(BACKOFF_STEPS) - 1)

        except requests.exceptions.HTTPError as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.warning(f"HTTP 오류 (재시도 {delay}초): {e}")
            time.sleep(delay)
            backoff_idx = min(backoff_idx + 1, len(BACKOFF_STEPS) - 1)

        except Exception as e:
            delay = BACKOFF_STEPS[min(backoff_idx, len(BACKOFF_STEPS) - 1)]
            log.error(f"예외 발생 (재시도 {delay}초): {e}", exc_info=True)
            time.sleep(delay)
            backoff_idx = min(backoff_idx + 1, len(BACKOFF_STEPS) - 1)


if __name__ == "__main__":
    main()
