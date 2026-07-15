"""
runners/ 검증 테스트
- ANTHROPIC_API_KEY 참조 없음 (코드·예제 파일)
- hermes_cli 모듈을 통해 hermes chat CLI 호출 (-q, --quiet, --source)
- 쉘 문자열 보간 없음 (명령 인젝션 불가)
- 실제 hermes 실행 없음 (hermes_cli.run_chat mock)
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
import hermes_cli as hermes_cli_mod  # noqa: E402


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


# ─── 2. hermes_cli 모듈 — 올바른 명령 형식 ─────────────────────────────────

class TestHermesCliModule:
    """hermes_cli.py 가 올바른 플래그를 사용하는지 정적 검증."""

    def test_hermes_cli_uses_short_query_flag(self):
        """-q (소문자) 플래그 사용: QUERY의 단축 플래그."""
        source = inspect.getsource(hermes_cli_mod)
        assert '"-q"' in source, \
            "hermes_cli에 -q 플래그가 없습니다. (-Q 는 quiet 플래그로 다릅니다)"

    def test_hermes_cli_no_capital_Q_as_query(self):
        """-Q 는 quiet 플래그 — query 플래그로 사용하면 안 됨."""
        source = inspect.getsource(hermes_cli_mod)
        # cmd 배열 내에서 -Q가 query로 사용되지 않아야 함
        # run_chat 함수 소스에 "-Q" 없음 확인
        run_chat_src = inspect.getsource(hermes_cli_mod.run_chat)
        assert '"-Q"' not in run_chat_src, \
            "run_chat에 -Q 플래그가 있습니다. (-Q 는 quiet, query 플래그는 -q 입니다)"

    def test_hermes_cli_uses_quiet_flag(self):
        """--quiet 플래그로 배너 없이 응답만 출력."""
        source = inspect.getsource(hermes_cli_mod)
        assert '"--quiet"' in source

    def test_hermes_cli_uses_source_flag(self):
        """--source 플래그로 세션 출처 태그 전달."""
        source = inspect.getsource(hermes_cli_mod)
        assert '"--source"' in source

    def test_hermes_cli_no_shell_true(self):
        """shell=True 금지 — 인수 배열 방식만 허용."""
        source = inspect.getsource(hermes_cli_mod)
        assert "shell=True" not in source

    def test_hermes_cli_strips_erp_credentials(self):
        """ERP_* 환경변수를 자식 프로세스에서 제거 (보안)."""
        source = inspect.getsource(hermes_cli_mod.run_chat)
        assert "ERP_" in source, "run_chat에 ERP_ 자격증명 제거 로직이 없습니다."

    def test_hermes_cli_uses_utf8_encoding(self):
        """한국어 출력 보장을 위해 encoding='utf-8' 사용."""
        source = inspect.getsource(hermes_cli_mod.run_chat)
        assert "utf-8" in source

    def test_hermes_cli_has_find_hermes_exe(self):
        """find_hermes_exe() 함수 존재."""
        assert callable(hermes_cli_mod.find_hermes_exe)

    def test_hermes_cli_has_sanitize_output(self):
        """sanitize_output() 함수 존재."""
        assert callable(hermes_cli_mod.sanitize_output)

    def test_hermes_cli_sanitize_removes_ansi(self):
        """sanitize_output이 ANSI 이스케이프 코드를 제거함."""
        text_with_ansi = "\x1b[32m초록색 텍스트\x1b[0m"
        result = hermes_cli_mod.sanitize_output(text_with_ansi)
        assert "\x1b" not in result
        assert "초록색 텍스트" in result

    def test_find_hermes_exe_uses_env_var(self):
        """HERMES_EXECUTABLE 환경변수가 설정되면 해당 경로 사용."""
        exe_path = str(BRIDGE_DIR / "hermes_cli.py")  # 존재하는 파일로 테스트
        with patch.dict(os.environ, {"HERMES_EXECUTABLE": exe_path}):
            result = hermes_cli_mod.find_hermes_exe()
        assert result == exe_path

    def test_find_hermes_exe_raises_on_missing_env_path(self):
        """HERMES_EXECUTABLE이 없는 경로를 가리키면 RuntimeError."""
        with patch.dict(os.environ, {"HERMES_EXECUTABLE": "/nonexistent/hermes.exe"}):
            with pytest.raises(RuntimeError, match="HERMES_EXECUTABLE"):
                hermes_cli_mod.find_hermes_exe()


# ─── 3. runners가 hermes_cli를 통해 CLI 호출 ─────────────────────────────────

class TestRunnersUseHermesCli:
    def _make_hermes_job(self):
        from protocol import AgentJob
        return AgentJob(job_id="j1", agent_type="hermes", user_id="u1", input="안녕하세요")

    def test_hermes_runner_imports_hermes_cli(self):
        """hermes.py가 hermes_cli 모듈을 import 해야 함."""
        source = inspect.getsource(hermes_runner)
        assert "hermes_cli" in source

    def test_marketer_runner_imports_hermes_cli(self):
        source = inspect.getsource(marketer_runner)
        assert "hermes_cli" in source

    def test_hermes_runner_calls_run_chat(self):
        """hermes.py가 hermes_cli.run_chat() 을 호출해야 함."""
        source = inspect.getsource(hermes_runner)
        assert "run_chat" in source

    def test_marketer_runner_calls_run_chat(self):
        source = inspect.getsource(marketer_runner)
        assert "run_chat" in source

    def test_hermes_runner_no_shell_true(self):
        source = inspect.getsource(hermes_runner)
        assert "shell=True" not in source

    def test_marketer_runner_no_shell_true(self):
        source = inspect.getsource(marketer_runner)
        assert "shell=True" not in source

    def test_hermes_runner_run_returns_output(self):
        """run() mock: hermes_cli.run_chat 정상 응답 시 output yield."""
        job = self._make_hermes_job()

        with patch("hermes_cli.run_chat", return_value="안녕하세요, 무엇을 도와드릴까요?"), \
             patch("runners.hermes._get_history_text", return_value=""):
            chunks = list(hermes_runner.run(job))

        assert len(chunks) == 1
        assert "안녕하세요" in chunks[0]

    def test_marketer_runner_run_returns_output(self):
        """run() mock: hermes_cli.run_chat 정상 응답 시 output yield."""
        from protocol import AgentJob
        job = AgentJob(job_id="j2", agent_type="marketer", user_id="u1",
                       input="SNS 카피 작성해줘")

        with patch("hermes_cli.run_chat", return_value="SNS 카피 초안입니다."):
            chunks = list(marketer_runner.run(job))

        assert len(chunks) == 1
        assert "SNS" in chunks[0]

    def test_hermes_runner_propagates_runtime_error(self):
        """hermes_cli.run_chat RuntimeError → runner에서도 전파됨."""
        job = self._make_hermes_job()

        with patch("hermes_cli.run_chat", side_effect=RuntimeError("hermes chat 종료 코드 1")), \
             patch("runners.hermes._get_history_text", return_value=""):
            with pytest.raises(RuntimeError, match="hermes"):
                list(hermes_runner.run(job))

    def test_hermes_runner_propagates_timeout(self):
        """hermes_cli.run_chat 시간 초과 → runner에서도 전파됨."""
        job = self._make_hermes_job()

        with patch("hermes_cli.run_chat", side_effect=RuntimeError("hermes chat 응답 시간 초과 (180초)")), \
             patch("runners.hermes._get_history_text", return_value=""):
            with pytest.raises(RuntimeError, match="시간 초과"):
                list(hermes_runner.run(job))

    def test_hermes_runner_error_no_secrets_exposed(self):
        """RuntimeError 메시지에 stderr 원문(자격증명 등) 미포함."""
        job = self._make_hermes_job()

        with patch("hermes_cli.run_chat", side_effect=RuntimeError("hermes chat 종료 코드 1")), \
             patch("runners.hermes._get_history_text", return_value=""):
            with pytest.raises(RuntimeError) as exc_info:
                list(hermes_runner.run(job))

        # stderr 원문 같은 내부 토큰이 노출되지 않아야 함
        assert "some-internal-error" not in str(exc_info.value)


# ─── 4. hermes_cli.run_chat subprocess 통합 테스트 (mock) ───────────────────

class TestHermesCliRunChat:
    """hermes_cli.run_chat 가 subprocess를 올바르게 호출하는지 검증."""

    def test_run_chat_calls_subprocess_with_correct_flags(self):
        """subprocess.run 호출 시 -q, --quiet, --source 플래그 확인."""
        fake = MagicMock()
        fake.returncode = 0
        fake.stdout = "테스트 응답"

        with patch("hermes_cli.subprocess.run", return_value=fake) as mock_run, \
             patch("hermes_cli.find_hermes_exe", return_value="/fake/hermes"):
            hermes_cli_mod.run_chat("테스트 쿼리", source="erp-test")

        call_args = mock_run.call_args
        cmd = call_args[0][0]
        assert cmd[0] == "/fake/hermes"
        assert "chat" in cmd
        assert "-q" in cmd
        assert "테스트 쿼리" in cmd
        assert "--quiet" in cmd
        assert "--source" in cmd
        assert "erp-test" in cmd
        # -Q (wrong flag) 없어야 함
        assert "-Q" not in cmd

    def test_run_chat_shell_false(self):
        """subprocess.run이 shell=True 없이 호출됨."""
        fake = MagicMock()
        fake.returncode = 0
        fake.stdout = "OK"

        with patch("hermes_cli.subprocess.run", return_value=fake) as mock_run, \
             patch("hermes_cli.find_hermes_exe", return_value="/fake/hermes"):
            hermes_cli_mod.run_chat("query", source="test")

        call_kwargs = mock_run.call_args[1]
        assert call_kwargs.get("shell", False) is False

    def test_run_chat_strips_erp_env(self):
        """ERP_* 환경변수가 자식 프로세스 env에서 제거됨."""
        fake = MagicMock()
        fake.returncode = 0
        fake.stdout = "OK"

        test_env = {"ERP_AGENT_API_KEY": "secret", "HOME": "/home/user", "PATH": "/usr/bin"}

        with patch("hermes_cli.subprocess.run", return_value=fake) as mock_run, \
             patch("hermes_cli.find_hermes_exe", return_value="/fake/hermes"), \
             patch("hermes_cli.os.environ", test_env):
            hermes_cli_mod.run_chat("query", source="test")

        passed_env = mock_run.call_args[1]["env"]
        assert "ERP_AGENT_API_KEY" not in passed_env
        assert "HOME" in passed_env  # 일반 변수는 유지

    def test_run_chat_raises_on_nonzero(self):
        """returncode != 0 → RuntimeError (stderr 원문 미포함)."""
        fake = MagicMock()
        fake.returncode = 1
        fake.stderr = "internal-credential-leak"

        with patch("hermes_cli.subprocess.run", return_value=fake), \
             patch("hermes_cli.find_hermes_exe", return_value="/fake/hermes"):
            with pytest.raises(RuntimeError) as exc_info:
                hermes_cli_mod.run_chat("query", source="test")

        assert "internal-credential-leak" not in str(exc_info.value)

    def test_run_chat_raises_on_timeout(self):
        """TimeoutExpired → RuntimeError('시간 초과')."""
        with patch("hermes_cli.subprocess.run",
                   side_effect=subprocess.TimeoutExpired(cmd="hermes", timeout=180)), \
             patch("hermes_cli.find_hermes_exe", return_value="/fake/hermes"):
            with pytest.raises(RuntimeError, match="시간 초과"):
                hermes_cli_mod.run_chat("query", source="test")

    def test_run_chat_raises_on_file_not_found(self):
        """hermes 없을 때 FileNotFoundError → RuntimeError."""
        with patch("hermes_cli.subprocess.run",
                   side_effect=FileNotFoundError()), \
             patch("hermes_cli.find_hermes_exe", return_value="/fake/hermes"):
            with pytest.raises(RuntimeError, match="hermes"):
                hermes_cli_mod.run_chat("query", source="test")


# ─── 5. 환경파일 공통 항목 ───────────────────────────────────────────────────

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
        hermes_content   = (BRIDGE_DIR / "hermes.env.example").read_text(encoding="utf-8")
        marketer_content = (BRIDGE_DIR / "marketer.env.example").read_text(encoding="utf-8")
        assert "MARKETER_BRIDGE_API_KEY" not in hermes_content
        assert "HERMES_BRIDGE_API_KEY" not in marketer_content
