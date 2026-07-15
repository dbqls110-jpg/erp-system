"""
runners/ 검증 테스트
- ANTHROPIC_API_KEY 참조 없음 (코드·예제 파일)
- hermes chat CLI를 subprocess 인수 배열로 호출
- 쉘 문자열 보간 없음 (명령 인젝션 불가)
- 실제 hermes 실행 없음 (subprocess.run mock)
"""
import os
import sys
import inspect
import subprocess
from unittest.mock import patch, MagicMock
from pathlib import Path

import pytest

BRIDGE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BRIDGE_DIR))

# 환경변수 설정 후 import
os.environ.setdefault("ERP_BASE_URL",     "http://localhost:9999")
os.environ.setdefault("ERP_AGENT_API_KEY", "test-key")
os.environ.setdefault("AGENT_TYPE",        "hermes")

from runners import hermes as hermes_runner   # noqa: E402
from runners import marketer as marketer_runner  # noqa: E402


# ─── 1. ANTHROPIC_API_KEY 참조 없음 ──────────────────────────────────────────

class TestNoAnthropicKey:
    def test_hermes_runner_no_anthropic_import(self):
        """import anthropic 또는 api.anthropic.com 호출 없음 (주석에 단어 등장은 허용)."""
        source = inspect.getsource(hermes_runner)
        assert "import anthropic" not in source, \
            "hermes.py에 'import anthropic'이 있습니다."
        assert "api.anthropic.com" not in source, \
            "hermes.py에 Anthropic API URL이 있습니다."

    def test_marketer_runner_no_anthropic_import(self):
        source = inspect.getsource(marketer_runner)
        assert "import anthropic" not in source, \
            "marketer.py에 'import anthropic'이 있습니다."
        assert "api.anthropic.com" not in source, \
            "marketer.py에 Anthropic API URL이 있습니다."

    def test_hermes_runner_no_api_key_var(self):
        source = inspect.getsource(hermes_runner)
        assert "ANTHROPIC_API_KEY" not in source, \
            "hermes.py에 ANTHROPIC_API_KEY 참조가 있습니다."

    def test_marketer_runner_no_api_key_var(self):
        source = inspect.getsource(marketer_runner)
        assert "ANTHROPIC_API_KEY" not in source, \
            "marketer.py에 ANTHROPIC_API_KEY 참조가 있습니다."

    def test_hermes_env_example_no_anthropic_key(self):
        env_path = BRIDGE_DIR / "hermes.env.example"
        content = env_path.read_text(encoding="utf-8")
        assert "ANTHROPIC_API_KEY" not in content, \
            "hermes.env.example에 ANTHROPIC_API_KEY가 있습니다."

    def test_marketer_env_example_no_anthropic_key(self):
        env_path = BRIDGE_DIR / "marketer.env.example"
        content = env_path.read_text(encoding="utf-8")
        assert "ANTHROPIC_API_KEY" not in content, \
            "marketer.env.example에 ANTHROPIC_API_KEY가 있습니다."


# ─── 2. hermes chat CLI 호출 방식 ─────────────────────────────────────────────

class TestHermesChatCLI:
    def _make_job(self):
        import sys; sys.path.insert(0, str(BRIDGE_DIR))
        from protocol import AgentJob
        return AgentJob(job_id="j1", agent_type="hermes", user_id="u1", input="안녕하세요")

    def test_hermes_runner_uses_subprocess(self):
        source = inspect.getsource(hermes_runner)
        assert "subprocess" in source

    def test_marketer_runner_uses_subprocess(self):
        source = inspect.getsource(marketer_runner)
        assert "subprocess" in source

    def test_hermes_runner_calls_hermes_chat(self):
        """hermes runner의 cmd 리스트가 hermes chat을 포함해야 함."""
        source = inspect.getsource(hermes_runner)
        assert '"hermes"' in source and '"chat"' in source

    def test_marketer_runner_calls_hermes_chat(self):
        source = inspect.getsource(marketer_runner)
        assert '"hermes"' in source and '"chat"' in source

    def test_hermes_runner_uses_quiet_flag(self):
        """hermes chat -Q (quiet) 플래그 사용 — 배너 없이 응답만 출력."""
        source = inspect.getsource(hermes_runner)
        assert '"-Q"' in source

    def test_marketer_runner_uses_quiet_flag(self):
        source = inspect.getsource(marketer_runner)
        assert '"-Q"' in source

    def test_hermes_runner_no_shell_true(self):
        """shell=True 금지 — 인수 배열 방식만 허용."""
        source = inspect.getsource(hermes_runner)
        assert "shell=True" not in source

    def test_marketer_runner_no_shell_true(self):
        source = inspect.getsource(marketer_runner)
        assert "shell=True" not in source

    def test_hermes_runner_query_flag(self):
        """--query 플래그로 입력 전달 (f-string 보간 없이)."""
        source = inspect.getsource(hermes_runner)
        assert '"--query"' in source

    def test_marketer_runner_query_flag(self):
        source = inspect.getsource(marketer_runner)
        assert '"--query"' in source

    def test_hermes_runner_run_returns_output(self):
        """run() mock: hermes 정상 응답 시 output yield."""
        job = self._make_job()
        fake = MagicMock()
        fake.returncode = 0
        fake.stdout = "안녕하세요, 무엇을 도와드릴까요?"

        with patch("runners.hermes.subprocess.run", return_value=fake), \
             patch("runners.hermes._get_history_text", return_value=""):
            chunks = list(hermes_runner.run(job))

        assert len(chunks) == 1
        assert "안녕하세요" in chunks[0]

    def test_marketer_runner_run_returns_output(self):
        """run() mock: hermes 정상 응답 시 output yield."""
        from protocol import AgentJob
        job = AgentJob(job_id="j2", agent_type="marketer", user_id="u1",
                       input="SNS 카피 작성해줘")
        fake = MagicMock()
        fake.returncode = 0
        fake.stdout = "SNS 카피 초안입니다."

        with patch("runners.marketer.subprocess.run", return_value=fake):
            chunks = list(marketer_runner.run(job))

        assert len(chunks) == 1
        assert "SNS" in chunks[0]

    def test_hermes_runner_raises_on_nonzero(self):
        """hermes exit != 0 → RuntimeError (stderr 원문은 노출 안 함)."""
        job = self._make_job()
        fake = MagicMock()
        fake.returncode = 1
        fake.stderr = "some-internal-error"

        with patch("runners.hermes.subprocess.run", return_value=fake), \
             patch("runners.hermes._get_history_text", return_value=""):
            with pytest.raises(RuntimeError) as exc_info:
                list(hermes_runner.run(job))

        # stderr 내용이 예외 메시지에 그대로 노출되지 않아야 함
        assert "some-internal-error" not in str(exc_info.value)

    def test_hermes_runner_timeout(self):
        """TimeoutExpired → RuntimeError."""
        job = self._make_job()
        with patch("runners.hermes.subprocess.run",
                   side_effect=subprocess.TimeoutExpired(cmd="hermes", timeout=120)), \
             patch("runners.hermes._get_history_text", return_value=""):
            with pytest.raises(RuntimeError, match="시간 초과"):
                list(hermes_runner.run(job))

    def test_hermes_runner_file_not_found(self):
        """hermes CLI 없을 때 명확한 에러."""
        job = self._make_job()
        with patch("runners.hermes.subprocess.run",
                   side_effect=FileNotFoundError()), \
             patch("runners.hermes._get_history_text", return_value=""):
            with pytest.raises(RuntimeError, match="hermes"):
                list(hermes_runner.run(job))


# ─── 3. 환경파일 공통 항목 ───────────────────────────────────────────────────

class TestEnvExamples:
    def test_hermes_env_has_erp_base_url(self):
        content = (BRIDGE_DIR / "hermes.env.example").read_text(encoding="utf-8")
        assert "ERP_BASE_URL" in content

    def test_hermes_env_has_erp_agent_api_key(self):
        content = (BRIDGE_DIR / "hermes.env.example").read_text(encoding="utf-8")
        assert "ERP_AGENT_API_KEY" in content

    def test_hermes_env_has_agent_type_hermes(self):
        content = (BRIDGE_DIR / "hermes.env.example").read_text(encoding="utf-8")
        assert "AGENT_TYPE=hermes" in content

    def test_marketer_env_has_erp_base_url(self):
        content = (BRIDGE_DIR / "marketer.env.example").read_text(encoding="utf-8")
        assert "ERP_BASE_URL" in content

    def test_marketer_env_has_erp_agent_api_key(self):
        content = (BRIDGE_DIR / "marketer.env.example").read_text(encoding="utf-8")
        assert "ERP_AGENT_API_KEY" in content

    def test_marketer_env_has_agent_type_marketer(self):
        content = (BRIDGE_DIR / "marketer.env.example").read_text(encoding="utf-8")
        assert "AGENT_TYPE=marketer" in content

    def test_env_files_use_different_bridge_keys(self):
        """두 파일의 BRIDGE API 키 설명이 분리돼 있어야 함 (교차 접근 금지)."""
        hermes_content  = (BRIDGE_DIR / "hermes.env.example").read_text(encoding="utf-8")
        marketer_content = (BRIDGE_DIR / "marketer.env.example").read_text(encoding="utf-8")
        # hermes env에 marketer 키 설명 없음 (교차 금지)
        assert "MARKETER_BRIDGE_API_KEY" not in hermes_content
        assert "HERMES_BRIDGE_API_KEY" not in marketer_content
