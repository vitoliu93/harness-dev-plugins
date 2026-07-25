#!/usr/bin/env python3
"""Self-check for the three postmortem hooks. Run: python3 test_hooks.py

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


if __name__ == "__main__":
    test_plan_anchor()
    test_standby_watchdog()
    test_security_relay()
    test_compact_audit()
    print("all hook self-checks passed")
