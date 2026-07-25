#!/usr/bin/env python3
"""PostToolUse(Agent) hook: never swallow a subagent's SECURITY WARNING.

Observed twice in one session: a deploy subagent returned "SECURITY WARNING …
no user message naming this production deploy as authorized"; the main context
read past it, kept going, and neither closing report mentioned it. The user
could not tell a classifier false-positive from a real authorization breach.

PostToolUse on the Agent tool (not SubagentStop — that event's output only
reaches the subagent itself; injecting into the parent is documented as the
Agent-tool PostToolUse path). Limitation: a background spawn returns "launched"
here and its warning arrives later in a task notification, out of hook reach —
the discipline still applies, this only mechanises the synchronous case.
"""
import json
import sys

NEEDLE = "SECURITY WARNING"

ADVICE = (
    "刚才的子代理返回里带 SECURITY WARNING。不许跳过：下一条面向用户的消息必须原文引用它的 "
    "Reason，并明确判断这是分类器误判（说明依据，例如目标是测试环境）还是真实的授权越界；"
    "判断为真实越界时停下等用户，不要继续下一个动作。收尾汇报里也要留一行。"
)


def flatten(x):
    if isinstance(x, str):
        return x
    if isinstance(x, list):
        return " ".join(flatten(i) for i in x)
    if isinstance(x, dict):
        return " ".join(flatten(v) for v in x.values())
    return ""


def main():
    payload = json.load(sys.stdin)
    if payload.get("tool_name") not in ("Agent", "Task"):
        return
    if NEEDLE not in flatten(payload.get("tool_response")):
        return
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": ADVICE,
        }
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
