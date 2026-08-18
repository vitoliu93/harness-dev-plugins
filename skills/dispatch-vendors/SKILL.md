---
name: dispatch-vendors
description: >-
  Delegate a self-contained task or advisory judgment to a separate AI process.
  Use when fanning out vendor work, seeking 第二意见, stuck after 2+ dead hypotheses, or before declaring done.
argument-hint: "[vendor + task | task brief | 第二意见 brief]"
metadata:
  kind: sop
---

# dispatch-vendors

Two lanes in a separate AI process:

- **Execution** — whole self-contained task → diff + machine acceptance
- **Advisory** — judgment verdict, no runnable gate

Unit = whole independent task, never a slice of work-in-progress (that's subagent/Workflow).

Gate yes → [protocol.md](references/protocol.md). Scenarios → [scenarios.md](references/scenarios.md). New carrier → [vendor-onboarding.md](references/vendor-onboarding.md).

Roster + advisory + execution gate: [gates-and-roster.md](references/gates-and-roster.md).

## Fleet — read the manifest first

Carriers and models are per-machine, never hardcoded here. Read
`$VENDOR_MANIFEST` (default
`${CCOBS_DIR:-$HOME/.claude/observability}/vendor-manifest.json`) before
dispatching: installed CLIs, quota pools, the two role rosters (`advisor` /
`executor`), the effort floor. Missing → bootstrap
per [vendor-onboarding.md](references/vendor-onboarding.md). references/ hold
the provider 坑 (carrier sheets) and the role-level
[model-use-guide.md](references/model-use-guide.md) — concrete model names
live in the manifest only.

Effort is never stored: pick it per task from the task's difficulty, never below
the manifest floor, and pass it in that cell's `effort_syntax`.

## Transport — herdr first

Dispatch's structural weakness is opacity: the work runs in someone else's
process and surfaces only as a final receipt, so a stale brief burns a whole
run before anyone notices. Inside Herdr (`HERDR_ENV=1`), give each vendor its
own split — the run stays observable while it happens, and mid-flight
correction is cheap in a visible pane, expensive after a receipt. Headless
launchers are the same dispatch minus the observability: use them only when
nobody is there to watch (outside Herdr, unattended/cron). Per-cell herdr
support (agent kind, launch quirks) is recorded in the manifest.

## Hard rule

Advice is hypothesis until you Read cited code paths. Vendor does not commit — you verify.

## Media fallback

Image-bearing briefs: vision-capable model or load `media-understanding`, set `MEDIA_SKILL_DIR=${CLAUDE_SKILL_DIR}` from that skill, run `${MEDIA_SKILL_DIR}/scripts/gemini_media.ts`.
