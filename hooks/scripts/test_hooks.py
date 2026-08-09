#!/usr/bin/env python3
"""Self-check for the hooks. Run: python3 test_hooks.py

Each case pipes a fixture payload into the hook and asserts on stdout.
No framework, no fixtures dir — the smallest thing that fails if the logic breaks.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent


def run(script, payload):
    p = subprocess.run([sys.executable, str(HERE / script)], input=json.dumps(payload),
                       capture_output=True, text=True, timeout=20)
    assert p.returncode == 0, f"{script} exited {p.returncode}: {p.stderr}"
    return p.stdout


def run_bun(script, payload, env=None):
    """Run a bun/TypeScript hook, piping the JSON payload to stdin."""
    merged = dict(os.environ)
    if env:
        merged.update(env)
    p = subprocess.run(
        ["bun", "run", str(HERE / script)],
        input=json.dumps(payload),
        capture_output=True, text=True, timeout=20,
        env=merged,
    )
    assert p.returncode == 0, f"{script} exited {p.returncode}: {p.stderr}\nstdout: {p.stdout}"
    return p.stdout


def test_plan_anchor():
    with tempfile.TemporaryDirectory() as d:
        plan = Path(d) / "docs" / "advanced-plans" / "2026-07-25-demo"
        plan.mkdir(parents=True)
        (plan / "goal.md").write_text(
            "# Goal\n\n## Intent\nnarrative that must NOT be replayed\n\n"
            "## 参考真源\ndocs/refs/demo/proto.html\n\n"
            "## Done means\n- the thing works\n\n"
            "## Explicitly out of scope\n- audio\n")
        (plan / "prototype.html").write_text("<html></html>")
        arch = Path(d) / "docs" / "advanced-plans" / "_archive" / "old"
        arch.mkdir(parents=True)
        (arch / "goal.md").write_text("## Done means\n- archived, must not appear\n")

        out = run("plan-anchor.py", {"source": "compact", "cwd": d})
        assert "参考真源" in out and "the thing works" in out, out
        assert "audio" in out and "prototype.html" in out, out
        assert "narrative that must NOT" not in out, "Intent leaked past the section filter"
        assert "archived, must not appear" not in out, "_archive not excluded"

        assert run("plan-anchor.py", {"source": "startup", "cwd": d}) == "", "fired on non-compact"
    print("plan-anchor      ok")


def test_standby_watchdog():
    base = {"session_id": "t-standby", "background_tasks": [{"id": "b1"}],
            "last_assistant_message": "Standing by for the re-render, then continuing."}
    Path(tempfile.gettempdir(), "standby-watchdog", base["session_id"]).unlink(missing_ok=True)

    out = run("standby-watchdog.py", base)
    assert json.loads(out)["hookSpecificOutput"]["hookEventName"] == "Stop", out
    assert run("standby-watchdog.py", base) == "", "fired twice in one session"

    quiet = dict(base, session_id="t-2", last_assistant_message="Done, all phases green.")
    assert run("standby-watchdog.py", quiet) == "", "fired without standby language"
    none = dict(base, session_id="t-3", background_tasks=[])
    assert run("standby-watchdog.py", none) == "", "fired with no background work"
    active = dict(base, session_id="t-4", stop_hook_active=True)
    assert run("standby-watchdog.py", active) == "", "ignored stop_hook_active"
    print("standby-watchdog ok")


def test_security_relay():
    hit = {"tool_name": "Agent", "tool_response": [
        {"type": "text", "text": "SECURITY WARNING: This subagent performed actions..."}]}
    out = run("security-warning-relay.py", hit)
    assert json.loads(out)["hookSpecificOutput"]["hookEventName"] == "PostToolUse", out

    assert run("security-warning-relay.py", {"tool_name": "Agent",
               "tool_response": "all good"}) == "", "fired without the needle"
    assert run("security-warning-relay.py", {"tool_name": "Bash",
               "tool_response": "SECURITY WARNING"}) == "", "fired on a non-Agent tool"
    print("security-relay   ok")


def test_compact_audit():
    with tempfile.TemporaryDirectory() as d:
        obs = Path(d) / "obs"
        plan = Path(d) / "docs" / "advanced-plans" / "2026-07-25-demo"
        plan.mkdir(parents=True)
        (plan / "goal.md").write_text(
            "## 参考真源\ndocs/refs/demo/proto.html · 判定=并排截图\n\n"
            "## Done means\n- IK3L2X 的控件全部可编辑\n")
        (plan / "prototype.html").write_text("<html></html>")

        env = dict(os.environ, CCOBS_DIR=str(obs))
        payload = {"session_id": "t-c", "cwd": d, "trigger": "auto",
                   "compact_summary": "Work continued on prototype.html and IK3L2X."}
        p = subprocess.run([sys.executable, str(HERE / "compact-audit.py")],
                           input=json.dumps(payload), capture_output=True, text=True, env=env)
        assert p.returncode == 0, p.stderr
        row = json.loads((obs / "compaction.jsonl").read_text().strip())
        plans = row["plans"][0]
        assert "docs/refs/demo/proto.html" in plans["dropped"], plans   # neither path nor basename in summary
        assert "2026-07-25-demo" in plans["dropped"], plans     # slug absent
        assert "prototype.html" in plans["survived"], plans
        assert "IK3L2X" in plans["survived"], plans
        assert Path(row["summary_file"]).read_text().startswith("Work continued")
    print("compact-audit    ok")


def test_prompt_forge_disabled():
    """PROMPT_FORGE=0 disables the hook."""
    assert run_bun("prompt-forge.ts", {"prompt": "whatever"},
                   env={"PROMPT_FORGE": "0"}) == ""
    print("prompt-forge-disabled ok")


def test_prompt_forge_gate1():
    """Gate 1: short inputs and confirmation words pass through silently."""
    # Enabled by default — no env flag needed
    assert run_bun("prompt-forge.ts", {"prompt": "ok"}) == ""
    assert run_bun("prompt-forge.ts", {"prompt": "fix the bug"}) == ""
    assert run_bun("prompt-forge.ts", {"prompt": "  好  "}) == ""
    assert run_bun("prompt-forge.ts", {"prompt": "go ahead"}) == ""
    assert run_bun("prompt-forge.ts", {"prompt": "got it"}) == ""
    # Long non-confirmation with mock pass → silent
    assert run_bun("prompt-forge.ts",
                   {"prompt": "this is a long and somewhat vague request to fix things"},
                   env={"PROMPT_FORGE_TEST_MOCK": '{"verdict":"pass"}'}) == ""
    print("prompt-forge-gate1 ok")


def test_prompt_forge_gate2():
    """Gate 2: LLM classification with mock responses."""
    long_prompt = "make the authentication system more robust and fix all the issues"

    # Mock: verdict pass → silent
    assert run_bun("prompt-forge.ts", {"prompt": long_prompt},
                   env={"PROMPT_FORGE_TEST_MOCK": '{"verdict":"pass"}'}) == ""

    # Mock: verdict rewrite → injects additionalContext
    out = run_bun("prompt-forge.ts", {"prompt": long_prompt},
                  env={"PROMPT_FORGE_TEST_MOCK":
                       '{"verdict":"rewrite","enriched":"Fix auth in src/login.ts"}'})
    result = json.loads(out)
    assert result["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"
    ctx = result["hookSpecificOutput"]["additionalContext"]
    assert "prompt-forge" in ctx
    assert "Enriched Prompt" in ctx
    assert "src/login.ts" in ctx

    # Mock: invalid JSON → fail-open silently
    assert run_bun("prompt-forge.ts", {"prompt": long_prompt},
                   env={"PROMPT_FORGE_TEST_MOCK": "not json"}) == ""

    # Empty prompt → silent
    assert run_bun("prompt-forge.ts", {"prompt": ""}) == ""

    # Invalid stdin → silent
    p = subprocess.run(
        ["bun", "run", str(HERE / "prompt-forge.ts")],
        input="not valid json", capture_output=True, text=True, timeout=20,
    )
    assert p.returncode == 0 and p.stdout == ""

    print("prompt-forge-gate2 ok")


def test_prompt_forge_logging():
    """Progress logs go to stderr only; stdout stays pure hook JSON."""

    def run_case(prompt, mock=None):
        env = dict(os.environ, PROMPT_FORGE_TEST_MOCK=mock) if mock else dict(os.environ)
        p = subprocess.run(
            ["bun", "run", str(HERE / "prompt-forge.ts")],
            input=json.dumps({"prompt": prompt}),
            capture_output=True, text=True, timeout=20, env=env,
        )
        assert p.returncode == 0, p.stderr
        return p

    # Gate 1 reasons are distinguishable in the log
    assert "confirmation word" in run_case("ok").stderr
    assert "short input" in run_case("fix the bug").stderr

    long_prompt = "make the authentication system more robust and fix all the issues"
    ok = run_case(long_prompt, '{"verdict":"pass"}')
    assert "gate2: classifying" in ok.stderr and "verdict=pass" in ok.stderr, ok.stderr
    assert ok.stdout == "", "stdout must stay empty on pass"

    rw = run_case(long_prompt, '{"verdict":"rewrite","enriched":"Fix auth in src/login.ts"}')
    assert "verdict=rewrite" in rw.stderr and "injecting additionalContext" in rw.stderr, rw.stderr
    assert json.loads(rw.stdout)["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"

    bad = run_case(long_prompt, "not json")
    assert "llm-call failed" in bad.stderr and "fail-open" in bad.stderr, bad.stderr
    assert bad.stdout == "", "fail-open must not emit stdout"

    disabled = subprocess.run(
        ["bun", "run", str(HERE / "prompt-forge.ts")],
        input=json.dumps({"prompt": long_prompt}),
        capture_output=True, text=True, timeout=20,
        env=dict(os.environ, PROMPT_FORGE="0"),
    )
    assert "disabled" in disabled.stderr and disabled.stdout == ""

    print("prompt-forge-logging ok")


if __name__ == "__main__":
    test_plan_anchor()
    test_standby_watchdog()
    test_security_relay()
    test_compact_audit()
    test_prompt_forge_disabled()
    test_prompt_forge_gate1()
    test_prompt_forge_gate2()
    test_prompt_forge_logging()
    print("all hook self-checks passed")
