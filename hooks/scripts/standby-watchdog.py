#!/usr/bin/env python3
"""Stop hook: don't park the session in a silent "waiting for X" state.

Failure this exists for: a session ended a turn with "standing by for the
re-render", the background agent it was waiting on died with the process, and
18 hours passed before anyone noticed. Stopping *while* background work runs is
normal (completion re-invokes the session). Stopping while **narrating that you
are waiting** is the parked state — nobody is watching it, so tell the user.

Fires at most once per session (marker file). Never blocks: it emits Stop
feedback via additionalContext, so the model can notify and then stop.
"""
import json
import os
import re
import sys
from pathlib import Path

MARKER_DIR = Path(os.environ.get("TMPDIR", "/tmp")) / "standby-watchdog"

STANDBY = re.compile(
    r"standing by|stand by|waiting (for|on)|awaiting|等(待|它|结果)|等.{0,6}跑完|"
    r"once (it|the .{1,20}) (finishes|completes|returns)|will (resume|continue) (once|when)",
    re.I,
)

ADVICE = (
    "你正停在「等待中」：还有后台任务在跑，而你这一轮的结尾是在描述等待。"
    "没有人在看这个会话——后台任务若随进程死掉，它就静默悬空了（真实代价：一次 18 小时）。"
    "停之前二选一：① 真的要等 → 用阻塞轮询（Monitor / until-loop）把等待放进这一轮；"
    "② 等不了 → 先 PushNotification 通知用户「已派出 X，结果回来我继续」，再停。"
    "别只是在文字里说自己在等。"
)


def main():
    payload = json.load(sys.stdin)
    if payload.get("stop_hook_active"):
        return
    if not payload.get("background_tasks"):
        return
    if not STANDBY.search(payload.get("last_assistant_message") or ""):
        return

    sid = payload.get("session_id") or "unknown"
    MARKER_DIR.mkdir(parents=True, exist_ok=True)
    marker = MARKER_DIR / sid
    if marker.exists():
        return
    marker.touch()

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "additionalContext": ADVICE,
        }
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
