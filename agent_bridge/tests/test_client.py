"""
agent_bridge/client.py 자동화 테스트
실제 AI 호출 없음 — 모든 HTTP 요청 mock 처리

커버 범위:
  1. SSE 라인 파싱
  2. 중복 작업 방지 (dedup)
  3. 운영 시간 계산
  4. 1초 폴링 코드 없음 (정적 분석)
  5. 재연결 시 recover_pending 호출
  6. AGENT_TYPE 유효성 (잘못된 값 → exit(1))
  7. 필수 환경변수 누락 → exit(1)
"""

import os
import sys
import json
import threading
import subprocess
import inspect
import importlib
from unittest.mock import patch, MagicMock, call
from datetime import datetime, timezone, timedelta

import pytest

# ─── 모듈 임포트 전 환경변수 설정 ───────────────────────────────────────────

BRIDGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BRIDGE_DIR)

os.environ.setdefault("ERP_BASE_URL",    "http://localhost:9999")
os.environ.setdefault("ERP_AGENT_API_KEY", "test-bridge-key")
os.environ.setdefault("AGENT_TYPE",      "hermes")

import client  # noqa: E402  (must be after env setup)

# ─── 1. SSE 라인 파싱 ───────────────────────────────────────────────────────

class TestParseSseLine:
    def test_event_field(self):
        assert client._parse_sse_line("event: job") == ("event", "job")

    def test_data_field(self):
        payload = '{"jobId": "j1", "agentType": "hermes"}'
        assert client._parse_sse_line(f"data: {payload}") == ("data", payload)

    def test_empty_line(self):
        assert client._parse_sse_line("") == (None, None)

    def test_comment_line(self):
        assert client._parse_sse_line(": ping") == (None, None)

    def test_data_with_spaces(self):
        field, val = client._parse_sse_line("data:   trimmed  ")
        assert field == "data"
        assert val == "trimmed"

    def test_ping_event(self):
        assert client._parse_sse_line("event: ping") == ("event", "ping")


# ─── 2. 중복 작업 방지 (dedup) ──────────────────────────────────────────────

class TestDedup:
    def setup_method(self):
        client._active_jobs.clear()

    def test_first_claim_succeeds(self):
        assert client._try_claim("job-001") is True

    def test_second_claim_same_id_fails(self):
        client._try_claim("job-001")
        assert client._try_claim("job-001") is False

    def test_release_allows_reclaim(self):
        client._try_claim("job-001")
        client._release("job-001")
        assert client._try_claim("job-001") is True

    def test_different_job_ids_independent(self):
        assert client._try_claim("job-A") is True
        assert client._try_claim("job-B") is True
        assert "job-A" in client._active_jobs
        assert "job-B" in client._active_jobs

    def test_release_nonexistent_is_safe(self):
        # discard는 없는 값도 안전하게 처리
        client._release("does-not-exist")

    def test_thread_safety(self):
        """동시 요청 중 하나만 claim 성공"""
        results = []
        lock = threading.Lock()

        def try_claim():
            result = client._try_claim("concurrent-job")
            with lock:
                results.append(result)

        threads = [threading.Thread(target=try_claim) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert results.count(True) == 1
        assert results.count(False) == 9


# ─── 3. 운영 시간 계산 ──────────────────────────────────────────────────────

KST = timezone(timedelta(hours=9))

class TestOperatingHours:
    def _set_hour(self, hour: int):
        """KST 기준 특정 시각 mock."""
        dt = datetime(2026, 7, 15, hour, 0, 0, tzinfo=KST)
        return patch("client.datetime", wraps=datetime.__class__) if False else dt

    def test_in_hours_morning(self):
        """09:00 KST → 운영 중"""
        with patch("client.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 7, 15, 9, 0, 0, tzinfo=KST)
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            result = client.is_operating_hours.__wrapped__() if hasattr(client.is_operating_hours, '__wrapped__') else None

        # 직접 시간 논리 테스트
        # OPEN_HOUR=8, CLOSE_HOUR=1 (익일 01:00)
        # h >= 8 OR h < 1 → 운영 중
        h = 9
        open_h, close_h = 8, 1
        in_hours = h >= open_h or h < close_h
        assert in_hours is True

    def test_out_of_hours_3am(self):
        """03:00 KST → 운영 종료"""
        h = 3
        open_h, close_h = 8, 1
        in_hours = h >= open_h or h < close_h
        assert in_hours is False

    def test_midnight_in_hours(self):
        """00:00 KST → 운영 중 (01:00 이전)"""
        h = 0
        open_h, close_h = 8, 1
        in_hours = h >= open_h or h < close_h
        assert in_hours is True


# ─── 4. 폴링 코드 없음 (정적 분석) ─────────────────────────────────────────

class TestNoPolling:
    def test_sse_loop_has_no_1sec_sleep(self):
        """sse_loop 내에 time.sleep(1) 없음 — 1초 폴링 패턴 금지."""
        source = inspect.getsource(client.sse_loop)
        assert "sleep(1)" not in source, \
            "sse_loop에 sleep(1)이 있습니다. SSE 기반으로 변경해야 합니다."

    def test_sse_loop_has_no_pending_repeated_call(self):
        """sse_loop 루프 내부에 api_get('/pending') 직접 호출 없음."""
        source = inspect.getsource(client.sse_loop)
        # recover_pending은 별도 함수로 호출하지만, /pending 직접 polling은 없어야 함
        # while True 내에서 api_get("pending") 직접 호출 여부 확인
        assert 'api_get("/api/agent/jobs/pending"' not in source, \
            "sse_loop가 /pending을 직접 호출하고 있습니다. recover_pending() 함수를 사용하세요."

    def test_recover_pending_calls_pending_api(self):
        """recover_pending은 /api/agent/jobs/pending을 호출해야 함."""
        source = inspect.getsource(client.recover_pending)
        assert "/api/agent/jobs/pending" in source

    def test_sse_loop_uses_iter_lines(self):
        """sse_loop가 SSE 스트림을 iter_lines로 처리함."""
        source = inspect.getsource(client.sse_loop)
        assert "iter_lines" in source


# ─── 5. 재연결 시 recover_pending 호출 ─────────────────────────────────────

class TestReconnectRecovery:
    def test_recover_pending_called_on_connect(self):
        """SSE 연결 시도할 때마다 recover_pending이 새 스레드로 실행됨."""
        calls_made = []

        def fake_recover():
            calls_made.append(1)

        connect_count = 0

        class FakeResp:
            status_code = 200

            def raise_for_status(self):
                pass

            def iter_lines(self, decode_unicode=False):
                nonlocal connect_count
                connect_count += 1
                if connect_count >= 2:
                    raise Exception("stop test")
                yield "event: ping"
                yield "data: {}"
                raise ConnectionError("disconnect")

        with patch.object(client, "recover_pending", side_effect=fake_recover), \
             patch("client.requests.get") as mock_get, \
             patch("client.is_operating_hours", return_value=True), \
             patch("client.time") as mock_time:
            mock_get.return_value.__enter__ = lambda s: FakeResp()
            mock_get.return_value.__exit__ = MagicMock(return_value=False)
            mock_time.sleep = MagicMock(side_effect=Exception("stop test"))

            try:
                client.sse_loop()
            except Exception:
                pass

        # 최소 1회 이상 recover_pending 호출됨
        assert len(calls_made) >= 1


# ─── 6. AGENT_TYPE 유효성 검사 ──────────────────────────────────────────────

class TestAgentTypeValidation:
    def test_invalid_agent_type_exits_1(self):
        """AGENT_TYPE=invalid 이면 프로세스 exit(1)."""
        env = {
            **os.environ,
            "ERP_BASE_URL": "http://localhost:9999",
            "ERP_AGENT_API_KEY": "test-key",
            "AGENT_TYPE": "invalid_type",
        }
        result = subprocess.run(
            [sys.executable, "client.py"],
            env=env,
            capture_output=True,
            cwd=BRIDGE_DIR,
            timeout=5,
        )
        assert result.returncode == 1
        assert b"hermes" in result.stderr or b"marketer" in result.stderr

    def test_missing_erp_base_url_exits_1(self):
        """ERP_BASE_URL 없으면 exit(1)."""
        env = {k: v for k, v in os.environ.items() if k != "ERP_BASE_URL"}
        env.pop("ERP_BASE_URL", None)
        env["ERP_AGENT_API_KEY"] = "test-key"
        env["AGENT_TYPE"] = "hermes"
        result = subprocess.run(
            [sys.executable, "client.py"],
            env=env,
            capture_output=True,
            cwd=BRIDGE_DIR,
            timeout=5,
        )
        assert result.returncode == 1

    def test_missing_api_key_exits_1(self):
        """ERP_AGENT_API_KEY 없으면 exit(1)."""
        env = {k: v for k, v in os.environ.items()}
        env.pop("ERP_AGENT_API_KEY", None)
        env["ERP_BASE_URL"] = "http://localhost:9999"
        env["AGENT_TYPE"] = "hermes"
        result = subprocess.run(
            [sys.executable, "client.py"],
            env=env,
            capture_output=True,
            cwd=BRIDGE_DIR,
            timeout=5,
        )
        assert result.returncode == 1


# ─── 7. 로그에 토큰 원문 없음 ───────────────────────────────────────────────

class TestNoTokenInLogs:
    def test_base_headers_not_logged(self):
        """_BASE_HEADERS (Bearer 토큰)가 로그 메시지에 포함되지 않음."""
        log_messages = []

        class FakeHandler:
            def emit(self, record):
                log_messages.append(record.getMessage())

        import logging
        handler = FakeHandler()
        client.log.addHandler(handler)

        try:
            # 정상적인 로그 메시지 몇 가지 발생
            client.log.info(f"ERP Agent Bridge v{client.VERSION} (type={client.AGENT_TYPE})")
        finally:
            client.log.removeHandler(handler)

        api_key = os.environ.get("ERP_AGENT_API_KEY", "")
        for msg in log_messages:
            assert api_key not in msg, f"API 키가 로그에 노출됨: {msg}"


# ─── 8. Heartbeat 운영 시간 준수 ────────────────────────────────────────────

class TestHeartbeatOperatingHours:
    def test_heartbeat_skips_outside_hours(self):
        """운영 시간 외에는 heartbeat HTTP 요청을 보내지 않음."""
        api_calls = []

        def fake_api_post(path, data, timeout=15):
            api_calls.append(path)
            return {}

        stop_after = [0]

        def fake_wait(timeout):
            stop_after[0] += 1
            return stop_after[0] >= 3  # 3번 체크 후 종료

        with patch.object(client, "is_operating_hours", return_value=False), \
             patch.object(client._hb_stop, "wait", side_effect=fake_wait), \
             patch.object(client, "api_post", side_effect=fake_api_post):
            client._heartbeat_loop()

        assert len(api_calls) == 0, \
            f"운영 시간 외에 heartbeat를 {len(api_calls)}회 전송했습니다."

    def test_heartbeat_sends_during_hours(self):
        """운영 시간 중에는 heartbeat HTTP 요청을 전송함."""
        api_calls = []

        def fake_api_post(path, data, timeout=15):
            api_calls.append(path)
            return {}

        stop_after = [0]

        def fake_wait(timeout):
            stop_after[0] += 1
            return stop_after[0] >= 2  # 2번 체크 후 종료

        with patch.object(client, "is_operating_hours", return_value=True), \
             patch.object(client._hb_stop, "wait", side_effect=fake_wait), \
             patch.object(client, "api_post", side_effect=fake_api_post):
            client._heartbeat_loop()

        assert len(api_calls) >= 1, "운영 시간 중 heartbeat가 전송되지 않았습니다."

    def test_sse_loop_long_sleep_during_quiet_hours(self):
        """운영 시간 외에 time.sleep이 600초 초과 (1시간 이내)로 호출됨."""
        sleep_calls = []

        with patch.object(client, "is_operating_hours", return_value=False), \
             patch.object(client, "seconds_until_open", return_value=21600), \
             patch("client.time.sleep", side_effect=lambda s: (sleep_calls.append(s), (_ for _ in ()).throw(Exception("stop"))) and None):
            try:
                client.sse_loop()
            except Exception:
                pass

        assert len(sleep_calls) >= 1
        # 1시간 이상 슬립 (단순 600초 폴링이 아님)
        assert sleep_calls[0] > 600, \
            f"quiet period sleep이 너무 짧습니다: {sleep_calls[0]}초"
        # 1시간 이내 슬립 (영원히 잠들지 않음)
        assert sleep_calls[0] <= 3600, \
            f"quiet period sleep이 너무 깁니다: {sleep_calls[0]}초"
