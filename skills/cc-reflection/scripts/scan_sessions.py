#!/usr/bin/env python3
"""Scan Claude Code session JSONL files in a date range and emit structured findings.

Usage:
    scan_sessions.py --start <utc_iso> --end <utc_iso> [--cwd <path>] [--output <path>] [--projects-dir <path>]

Reads JSONL files under --projects-dir (default ~/.claude/projects/), keeps lines whose
timestamp falls in [start, end), aggregates per-session metadata and friction moments,
and writes a JSON report to --output (default ~/.claude/reflections/.cache/scan-<label>.json).
Prints the output path on stdout. Stderr prints a one-line summary.

The output is intended to be Read by an LLM agent. To stay context-frugal, friction
snippets are truncated and assistant prose is NOT included verbatim — only
tool_use names, error counts, and turn durations.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PUSHBACK_PATTERN = re.compile(
    r"(?ix)"
    r"(?:^|\s|[，。,.;:!?！？])"
    r"(?:"
    # EN action verbs
    r"no\b|stop\b|wait\b|nope\b|undo\b|revert\b|stop\s+doing|"
    # EN evaluative — v1.1 addition based on missed pushback "you should... your plan is wrong"
    r"wrong\b|broken\b|doesn'?t\s+work|that'?s\s+not|messed\s+up|"
    r"you\s+misunderstood|you\s+should\b|should\s+have\b|you\s+forgot|"
    r"your\s+plan\s+is|that'?s\s+wrong|not\s+what\s+i|"
    # ZH
    r"不对|错了|不是这|不应该|不要这|别这|别这样|"
    r"重新|回退|撤销|回滚|"
    r"我说过|我让你|你应该|你不应该|你怎么|为什么你|"
    r"等等|"
    # ZH v1.2 additions — mild corrections missed by v1.1 (§6.1)
    r"大概率不行|走不通|确认下|不需要|既然.{0,10}就|你应该是|应该是.{0,10}问题|"
    # ZH v1.3 §6.2 — conservative additions for mild corrections (low-ambiguity terms only)
    r"不满意|不太行|足够[了啦]|够了\b|而不是|还是不|我都不|^不是[，,、\s]|"
    # EN v1.3 §6.2 — "actually" with ZH/EN follow-up context to avoid bare-actually false-positives
    r"actually[，,]?\s*(?:我们|其实|我|你)"
    r")"
)

# v1.2: noise filter — messages that look like framework injections, doc pastes, or
# second-opinion requests should NOT be tested for pushback (§6.1)
# v1.3 §6.3: extend with bash-output wrappers that triggered false pushback on "no output" text
NOISE_PATTERN = re.compile(
    r"^<task-notification>|"
    r"^This session is being continued from a previous conversation|"
    r"^<command-message>|"
    r"^<command-name>|"
    r"^<system-reminder>|"
    r"I'?m rebuilding\b.{0,80}second\s+opinion|"  # second-opinion request
    r"want\s+a\s+second\s+opinion\b|"
    r"<div\s+data-tips=|<!DOCTYPE\s+html|"  # doc/html paste
    r"```[a-z]{2,}\n|"  # large code/doc paste
    # v1.3 §6.3: bash output wrappers — these are tool results, not user speech
    r"^<bash-stdout>|^<bash-stderr>|^<local-command-caveat>|"
    r"Bash completed with no output|\(eval\):\d|no matches found|command not found",
    re.MULTILINE | re.IGNORECASE,
)

# v1.3 §6.4: requirement-brief keywords — long user messages with these terms are context
# briefings, not pushback. Check applied in is_noise block (len > 500 AND keyword present).
REQUIREMENT_BRIEF_KEYWORDS = re.compile(
    r"需求背景|需求|任务|我们要|我希望|The\s+user\s+wants|context",
    re.IGNORECASE,
)

# v1.2: status-update pattern — short "Continue X / 继续" messages without negative words
# are coordination, not pushback (§6.1)
STATUS_UPDATE_PATTERN = re.compile(
    r"^(?:Continue\b|继续\b|Checking\b|check\b)",
    re.IGNORECASE,
)
STATUS_NEGATIVE_PATTERN = re.compile(
    r"不|wrong|stop|错|应该|broken|fail|issue",
    re.IGNORECASE,
)

CONFIDENT_CLAIM_PATTERN = re.compile(
    r"(?ix)(?:显然|肯定|根因是|应该没问题|绝对|"
    r"definitely|certainly|obviously|absolutely|guaranteed)"
)

# v1.1 addition: text-inferred tool errors that don't carry is_error=true
ERROR_TEXT_PATTERN = re.compile(
    r"(?im)(?:^|[\s>])(?:"
    r"Exit\s+code\s+[1-9]\d*|"
    r"Permission\s+denied\s+by\s+auto\s+mode|"
    r"Blocked:\s|"
    r"String\s+to\s+replace\s+not\s+found|"
    r"\(directory\s+not\s+found\)|"
    r"File\s+(?:does\s+not\s+exist|not\s+found)|"
    r"command\s+not\s+found"
    r")"
)

# v1.1 addition: detect system-reminder / command-template prefixes injected into user messages
# (e.g., when user types /skill-name, the harness prepends the skill body — the actual user text
# is everything after "ARGUMENTS:")
SYSTEM_REMINDER_HEAD = re.compile(
    r"^\s*(?:"
    r"<(?:command-message|command-name|command-args|system-reminder|command-stdout)\b|"
    r"Base directory for this skill:|"
    r"You are an interactive agent"
    r")"
)

ARGUMENTS_SPLIT = re.compile(r"\n+ARGUMENTS:\s*", re.IGNORECASE)


def strip_system_prefix(text: str) -> str:
    """If a user message begins with a harness-injected system/command template,
    return only the substantive user portion (after `ARGUMENTS:` marker)."""
    if not SYSTEM_REMINDER_HEAD.match(text):
        return text
    parts = ARGUMENTS_SPLIT.split(text, maxsplit=1)
    if len(parts) == 2:
        return parts[1]
    return ""  # pure system content, no real user instruction


def parse_iso(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def session_aggregate() -> dict[str, Any]:
    return {
        "id": None,
        "title": None,
        "cwd": None,
        "model": None,
        "first_ts": None,
        "last_ts": None,
        "user_msgs": 0,
        "assistant_msgs": 0,
        "sidechain_msgs": 0,
        "tools_used": Counter(),
        "tool_errors_flagged": 0,       # v1.1: from is_error=true
        "tool_errors_text_inferred": 0, # v1.1: from text matching ERROR_TEXT_PATTERN
        "turn_durations_ms": [],
        "pushback_count": 0,
        "confident_claims": 0,
        "compaction_events": 0,
        "friction_moments": [],
        "models_seen": Counter(),
        # v1.3 §6.1: per-session dedup set for friction events (prevents replay double-counting)
        "_seen_friction_sigs": set(),
    }


def truncate(s: str, n: int = 240) -> str:
    s = s.strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def extract_text(msg: dict[str, Any]) -> str:
    content = msg.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict):
                if c.get("type") == "text":
                    parts.append(c.get("text", ""))
                elif c.get("type") == "thinking":
                    continue
        return "\n".join(parts)
    return ""


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except OSError:
        return


def file_in_range(path: Path, start: datetime, end: datetime) -> bool:
    """Quick mtime check before full parse."""
    try:
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        return False
    return mtime >= start and mtime <= end.replace(tzinfo=timezone.utc) + (end - start)


def process_event(
    evt: dict[str, Any],
    session: dict[str, Any],
    start: datetime,
    end: datetime,
    cwd_filter: str | None,
) -> bool:
    """Update session aggregate from one event. Returns True if event was in range."""
    t = evt.get("type")
    ts = parse_iso(evt.get("timestamp", ""))

    if t == "ai-title":
        session["title"] = evt.get("aiTitle") or session["title"]
        return False
    if t == "agent-name" and not session["title"]:
        session["title"] = evt.get("agentName")
        return False

    if ts is None:
        return False
    if ts < start or ts >= end:
        return False

    if cwd_filter and evt.get("cwd") and not evt["cwd"].startswith(cwd_filter):
        return False

    session["id"] = evt.get("sessionId") or session["id"]
    session["cwd"] = evt.get("cwd") or session["cwd"]
    if session["first_ts"] is None or ts < parse_iso(session["first_ts"]):
        session["first_ts"] = ts.isoformat()
    if session["last_ts"] is None or ts > parse_iso(session["last_ts"]):
        session["last_ts"] = ts.isoformat()

    if t == "user":
        msg = evt.get("message", {})
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content")
            is_tool_result_only = False
            if isinstance(content, list):
                tool_result_blocks = [
                    c for c in content
                    if isinstance(c, dict) and c.get("type") == "tool_result"
                ]
                if tool_result_blocks:
                    is_tool_result_only = not any(
                        isinstance(c, dict) and c.get("type") == "text"
                        for c in content
                    )
                    for c in tool_result_blocks:
                        is_flagged = bool(c.get("is_error"))
                        # v1.1: also infer from text content
                        tr_content = c.get("content")
                        tr_text = ""
                        if isinstance(tr_content, str):
                            tr_text = tr_content
                        elif isinstance(tr_content, list):
                            tr_text = "\n".join(
                                cc.get("text", "")
                                for cc in tr_content
                                if isinstance(cc, dict) and cc.get("type") == "text"
                            )
                        text_inferred = bool(
                            not is_flagged and tr_text and ERROR_TEXT_PATTERN.search(tr_text)
                        )
                        if is_flagged or text_inferred:
                            _kind = "tool_error_flagged" if is_flagged else "tool_error_text"
                            _snippet = truncate(tr_text or "(no text)", 200)
                            # v1.3 §6.1: per-session dedup to avoid replay double-counting
                            _sig = (int(ts.timestamp()), _kind, _snippet[:60])
                            if _sig not in session["_seen_friction_sigs"]:
                                session["_seen_friction_sigs"].add(_sig)
                                if is_flagged:
                                    session["tool_errors_flagged"] += 1
                                if text_inferred:
                                    session["tool_errors_text_inferred"] += 1
                                session["friction_moments"].append(
                                    {
                                        "ts": ts.isoformat(),
                                        "kind": _kind,
                                        "snippet": _snippet,
                                    }
                                )
            content_text = extract_text(msg)
            # v1.1: strip harness-injected system/command prefix to avoid
            # false-positive pushback matches on system reminder text
            real_user_text = strip_system_prefix(content_text)
            if not is_tool_result_only:
                session["user_msgs"] += 1
                # v1.1: skip pushback check for sidechain (AI-to-AI subagent prompts
                # are not real vito input and frequently contain words like "NO prose summary")
                # v1.2: also skip if message is framework/paste noise (§6.1)
                is_noise = bool(
                    real_user_text
                    and (
                        (NOISE_PATTERN.search(real_user_text) and len(real_user_text) > 400)
                        or (
                            STATUS_UPDATE_PATTERN.match(real_user_text.strip())
                            and len(real_user_text) < 300
                            and not STATUS_NEGATIVE_PATTERN.search(real_user_text)
                        )
                        # v1.3 §6.4: long requirement brief — > 500 chars with context keywords
                        or (
                            len(real_user_text) > 500
                            and bool(REQUIREMENT_BRIEF_KEYWORDS.search(real_user_text))
                        )
                    )
                )
                if real_user_text and not evt.get("isSidechain") and not is_noise and PUSHBACK_PATTERN.search(real_user_text):
                    _pb_snippet = truncate(real_user_text)
                    # v1.3 §6.1: per-session dedup to avoid replay double-counting
                    _pb_sig = (int(ts.timestamp()), "user_pushback", _pb_snippet[:60])
                    if _pb_sig not in session["_seen_friction_sigs"]:
                        session["_seen_friction_sigs"].add(_pb_sig)
                        session["pushback_count"] += 1
                        session["friction_moments"].append(
                            {
                                "ts": ts.isoformat(),
                                "kind": "user_pushback",
                                "snippet": _pb_snippet,
                            }
                        )
        if evt.get("isSidechain"):
            session["sidechain_msgs"] += 1
        return True

    if t == "assistant":
        msg = evt.get("message", {})
        if isinstance(msg, dict):
            model = msg.get("model")
            if model:
                session["models_seen"][model] += 1
                if not session["model"]:
                    session["model"] = model
            session["assistant_msgs"] += 1
            content = msg.get("content")
            if isinstance(content, list):
                for c in content:
                    if not isinstance(c, dict):
                        continue
                    ctype = c.get("type")
                    if ctype == "tool_use":
                        session["tools_used"][c.get("name", "?")] += 1
                    elif ctype == "tool_result" and c.get("is_error"):
                        session["tool_errors_flagged"] += 1
                    elif ctype == "text":
                        text = c.get("text", "")
                        m = CONFIDENT_CLAIM_PATTERN.search(text)
                        if m:
                            # v1.1: skip enumerations / meta-references to the words
                            # themselves (e.g. `'显然 / 肯定 / 应该没问题'`) — when
                            # multiple confident words appear in a tight window,
                            # it's a list-of-words reference, not a confident claim.
                            win_lo = max(0, m.start() - 40)
                            win_hi = min(len(text), m.end() + 40)
                            window = text[win_lo:win_hi]
                            is_enumeration = len(CONFIDENT_CLAIM_PATTERN.findall(window)) >= 2
                            lc = text[max(0, m.start() - 1):m.start()]
                            rc = text[m.end():m.end() + 1]
                            is_quoted = lc in "`'\"“‘" and rc in "`'\"”’"
                            if not (is_enumeration or is_quoted):
                                ctx_lo = max(0, m.start() - 60)
                                ctx_hi = min(len(text), m.end() + 60)
                                _cc_snippet = truncate(text[ctx_lo:ctx_hi], 200)
                                # v1.3 §6.1: per-session dedup to avoid replay double-counting
                                _cc_sig = (int(ts.timestamp()), "confident_claim", _cc_snippet[:60])
                                if _cc_sig not in session["_seen_friction_sigs"]:
                                    session["_seen_friction_sigs"].add(_cc_sig)
                                    session["confident_claims"] += 1
                                    session["friction_moments"].append(
                                        {
                                            "ts": ts.isoformat(),
                                            "kind": "confident_claim",
                                            "snippet": _cc_snippet,
                                        }
                                    )
        if evt.get("isSidechain"):
            session["sidechain_msgs"] += 1
        return True

    if t == "system":
        subtype = evt.get("subtype")
        if subtype == "turn_duration":
            d = evt.get("durationMs")
            if isinstance(d, (int, float)):
                # v1.3 §6.1: per-session dedup — replay segments repeat turn_duration events
                # with identical (ts, durationMs); use a ts+duration sig to deduplicate.
                _td_sig = (int(ts.timestamp()), "turn_duration", f"{int(d)}"[:60])
                if _td_sig not in session["_seen_friction_sigs"]:
                    session["_seen_friction_sigs"].add(_td_sig)
                    session["turn_durations_ms"].append(int(d))
                    if d > 60_000:
                        _lt_snippet = f"turn took {d / 1000:.1f}s"
                        session["friction_moments"].append(
                            {
                                "ts": ts.isoformat(),
                                "kind": "long_turn",
                                "snippet": _lt_snippet,
                            }
                        )
        elif subtype and "compact" in subtype.lower():
            session["compaction_events"] += 1
        return True

    return False


def finalize(session: dict[str, Any]) -> dict[str, Any] | None:
    if not session["id"]:
        return None
    if session["user_msgs"] == 0 and session["assistant_msgs"] == 0:
        return None

    first = parse_iso(session["first_ts"])
    last = parse_iso(session["last_ts"])
    duration_min = round((last - first).total_seconds() / 60.0, 1) if first and last else 0.0
    durs = session["turn_durations_ms"]
    long_turns = sum(1 for d in durs if d > 60_000)

    return {
        "id": session["id"],
        "title": session["title"],
        "cwd": session["cwd"],
        "model": session["model"],
        "models_seen": dict(session["models_seen"]),
        "first_ts": session["first_ts"],
        "last_ts": session["last_ts"],
        "duration_min": duration_min,
        "user_msgs": session["user_msgs"],
        "assistant_msgs": session["assistant_msgs"],
        "sidechain_msgs": session["sidechain_msgs"],
        "tools_used": dict(session["tools_used"].most_common(15)),
        "tool_errors_flagged": session["tool_errors_flagged"],
        "tool_errors_text_inferred": session["tool_errors_text_inferred"],
        "tool_errors": session["tool_errors_flagged"] + session["tool_errors_text_inferred"],
        "long_turn_count": long_turns,
        "max_turn_ms": max(durs) if durs else 0,
        "pushback_count": session["pushback_count"],
        "confident_claims": session["confident_claims"],
        "compaction_events": session["compaction_events"],
        "friction_moments": session["friction_moments"][:30],
    }


def scan(
    start: datetime,
    end: datetime,
    cwd_filter: str | None,
    projects_dir: Path,
) -> dict[str, Any]:
    t0 = time.time()
    sessions: dict[str, dict[str, Any]] = defaultdict(session_aggregate)
    files_scanned = 0
    files_skipped = 0

    for proj_dir in sorted(projects_dir.iterdir()):
        if not proj_dir.is_dir():
            continue
        for jsonl_path in sorted(proj_dir.rglob("*.jsonl")):
            if not file_in_range(jsonl_path, start, end):
                files_skipped += 1
                continue
            files_scanned += 1
            session_id_from_file = jsonl_path.stem
            in_range_any = False
            for evt in iter_jsonl(jsonl_path):
                sid = evt.get("sessionId") or session_id_from_file
                bucket = sessions[sid]
                if process_event(evt, bucket, start, end, cwd_filter):
                    in_range_any = True
            if not in_range_any:
                sessions.pop(session_id_from_file, None)

    raw_finalized = [s for s in (finalize(b) for b in sessions.values()) if s]

    # v1.3 §6.1: reflection-invocation-session filter
    # Heuristic: duration < 1 min AND user_msgs < 5 AND tools only in {Skill, Bash}
    #            AND last_ts within 10 min of scan time
    _scan_at = datetime.now(tz=timezone.utc)
    _reflection_tools = {"Skill", "Bash"}

    def _is_reflection_invocation(s: dict[str, Any]) -> bool:
        if s["duration_min"] >= 1.0:
            return False
        if s["user_msgs"] > 8:        # §6.1: raised from >= 5; slash-command stubs can push to 5-7
            return False
        tools_set = set(s.get("tools_used", {}).keys())
        if tools_set and not tools_set.issubset(_reflection_tools):
            return False
        title = (s.get("title") or "").lower()   # §6.1: title-content fallback
        if "cc-reflection" in title or "复盘" in title:
            return True
        last_ts = parse_iso(s.get("last_ts", ""))
        if last_ts is None:
            return False
        age_min = (_scan_at - last_ts).total_seconds() / 60.0
        return age_min <= 10.0

    # v1.3 §6.2: non-Claude model session filter
    # Heuristic: all entries in models_seen do not contain "claude" (case-insensitive)
    def _is_non_claude_session(s: dict[str, Any]) -> bool:
        models = s.get("models_seen", {})
        if not models:
            return False  # no model info → can't classify, keep
        return not any("claude" in m.lower() for m in models)

    # v1.2 §6.3: filter MiniMax sub-session noise
    # Heuristic: duration < 0.2 min AND user_msgs == 1 AND no claude in models AND no tools
    def _is_minimax_noise(s: dict[str, Any]) -> bool:
        if s["duration_min"] >= 0.2:
            return False
        if s["user_msgs"] != 1:
            return False
        if any("claude" in m.lower() for m in s.get("models_seen", {})):
            return False
        if s.get("tools_used"):
            return False
        return True

    # §6.2: empty session filter — cc never replied (assistant_msgs == 0)
    def _is_empty_session(s: dict[str, Any]) -> bool:
        return s.get("assistant_msgs", 0) == 0  # cc never replied = no collaboration occurred

    reflection_invocation_sessions = [s for s in raw_finalized if _is_reflection_invocation(s)]
    other_agent_sessions = [
        s for s in raw_finalized
        if not _is_reflection_invocation(s) and _is_non_claude_session(s)
    ]
    noise_sessions = [
        s for s in raw_finalized
        if not _is_reflection_invocation(s)
        and not _is_non_claude_session(s)
        and _is_minimax_noise(s)
    ]
    empty_sessions = [
        s for s in raw_finalized
        if not _is_reflection_invocation(s)
        and not _is_non_claude_session(s)
        and not _is_minimax_noise(s)
        and _is_empty_session(s)
    ]
    non_noise = [
        s for s in raw_finalized
        if not _is_reflection_invocation(s)
        and not _is_non_claude_session(s)
        and not _is_minimax_noise(s)
        and not _is_empty_session(s)
    ]

    # v1.2 §6.2: dedup by (first_ts, last_ts, title, max_turn_ms)
    seen_dedup_keys: dict[tuple, str] = {}  # key -> first session id seen
    dedup_marked: set[str] = set()
    for s in non_noise:
        key = (s["first_ts"], s["last_ts"], s.get("title"), s["max_turn_ms"])
        if key in seen_dedup_keys:
            dedup_marked.add(s["id"])
            s["is_duplicate_of"] = seen_dedup_keys[key]
        else:
            seen_dedup_keys[key] = s["id"]

    finalized = non_noise  # keep all in sessions list (duplicates marked), dedup in cross_session
    finalized.sort(key=lambda s: s["first_ts"] or "")

    agg_tools: Counter = Counter()
    total_user = total_assistant = total_pushbacks = total_long_turns = 0
    total_errors_flagged = total_errors_text = total_confident_claims = 0
    total_duration_min = 0.0
    # v1.2: only aggregate non-duplicate sessions into cross_session totals
    for s in finalized:
        if s.get("is_duplicate_of"):
            continue
        agg_tools.update(s["tools_used"])
        total_user += s["user_msgs"]
        total_assistant += s["assistant_msgs"]
        total_pushbacks += s["pushback_count"]
        total_errors_flagged += s["tool_errors_flagged"]
        total_errors_text += s["tool_errors_text_inferred"]
        total_confident_claims += s["confident_claims"]
        total_long_turns += s["long_turn_count"]
        total_duration_min += s["duration_min"]

    deduped_count = len(finalized) - len(dedup_marked)

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "scan_meta": {
            "projects_dir": str(projects_dir),
            "cwd_filter": cwd_filter,
            "files_scanned": files_scanned,
            "files_skipped": files_skipped,
            "elapsed_sec": round(time.time() - t0, 2),
            "scanned_at": datetime.now(tz=timezone.utc).isoformat(),
        },
        "sessions": finalized,
        "cross_session": {
            "session_count": deduped_count,           # v1.2: excludes duplicates
            "session_count_raw": len(finalized),       # v1.2: before dedup
            "duplicate_session_count": len(dedup_marked),  # v1.2
            "noise_session_count": len(noise_sessions),    # v1.2: MiniMax sub-sessions
            "empty_session_count": len(empty_sessions),     # §6.2: sessions where cc never replied
            # v1.3 §6.1: reflection-invocation sessions (own-session noise)
            "reflection_invocation_session_count": len(reflection_invocation_sessions),
            "reflection_invocation_session_ids": [s["id"] for s in reflection_invocation_sessions],
            # v1.3 §6.2: non-Claude model sessions excluded from cc stats
            "other_agent_sessions": [
                {"id": s["id"], "title": s.get("title"), "models_seen": s.get("models_seen", {}),
                 "duration_min": s["duration_min"], "user_msgs": s["user_msgs"]}
                for s in other_agent_sessions
            ],
            "total_duration_min": round(total_duration_min, 1),
            "total_user_msgs": total_user,
            "total_assistant_msgs": total_assistant,
            "total_pushbacks": total_pushbacks,
            "total_tool_errors_flagged": total_errors_flagged,
            "total_tool_errors_text_inferred": total_errors_text,
            "total_tool_errors": total_errors_flagged + total_errors_text,
            "total_confident_claims": total_confident_claims,
            "total_long_turns": total_long_turns,
            "top_tools": dict(agg_tools.most_common(20)),
            "thin_sample": total_user < 10,  # v1.1: signal report-writer to use sparse mode
        },
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--start", required=True, help="UTC ISO start (inclusive)")
    p.add_argument("--end", required=True, help="UTC ISO end (exclusive)")
    p.add_argument("--cwd", default=None, help="Filter to sessions whose cwd starts with this path")
    p.add_argument("--output", default=None, help="Output JSON path (default: tmp under ~/.claude/reflections/.cache/)")
    p.add_argument(
        "--projects-dir",
        default=str(Path.home() / ".claude" / "projects"),
        help="Override projects dir (default ~/.claude/projects)",
    )
    p.add_argument("--label", default=None, help="Optional label for output filename")
    args = p.parse_args()

    start = parse_iso(args.start)
    end = parse_iso(args.end)
    if not start or not end:
        print("error: --start/--end must be ISO timestamps", file=sys.stderr)
        return 2
    if end <= start:
        print("error: --end must be after --start", file=sys.stderr)
        return 2

    projects_dir = Path(args.projects_dir).expanduser()
    if not projects_dir.is_dir():
        print(f"error: projects dir not found: {projects_dir}", file=sys.stderr)
        return 2

    if args.output:
        output_path = Path(args.output).expanduser()
    else:
        cache_dir = Path.home() / ".claude" / "reflections" / ".cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        label = args.label or start.strftime("%Y-%m-%d")
        output_path = cache_dir / f"scan-{label}.json"

    result = scan(start, end, args.cwd, projects_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    meta = result["scan_meta"]
    cs = result["cross_session"]
    print(str(output_path))
    thin_marker = "  [THIN SAMPLE — use sparse mode]" if cs.get("thin_sample") else ""
    print(
        f"scanned {meta['files_scanned']} file(s), {cs['session_count']} session(s), "
        f"{cs['total_pushbacks']} pushback(s), "
        f"{cs['total_tool_errors_flagged']}+{cs['total_tool_errors_text_inferred']} err(flagged+text), "
        f"{cs['total_confident_claims']} confident-claim(s), "
        f"{cs['total_duration_min']} min total, in {meta['elapsed_sec']}s{thin_marker}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
