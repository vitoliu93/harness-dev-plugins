---
name: cc-reflection
version: 1.1.0
description: Produce a research-grounded reflection report on vito × cc collaboration over a date range. Use when the user says "复盘", "反思", "review CC usage", "复盘今天/昨天/上周", "总结今天的协作", or invokes /cc-reflection.
---

# cc-reflection

Produce a structured reflection report on vito × cc collaboration over a date range. The skill is designed against three documented LLM failure modes when a model reflects on itself: self-bias amplification, premature commitment, and same-model echo chamber. See `references/methodology.md` for the research grounding.

## When to use

Trigger on:
- `复盘`, `反思`, `做复盘`, `复盘今天`, `复盘昨天`, `复盘上周`, `复盘最近 N 天`
- `cc-reflection`, `/cc-reflection`, `review cc usage`, `review my collaboration with cc`
- `总结今天的协作`, `今天和 cc 协作怎么样`
- Any request to analyze cc collaboration patterns over time

Default date range: **today** (local timezone) — **but in early-morning hours (local time < 04:00) the empty-arg default auto-switches to `recent-24h`** to avoid generating a report for a near-empty future window (v1.1 fix). Explicit `今天` / `today` always honors the literal calendar day even when called pre-04:00.

Accept ranges:
- (no arg) — today, or recent-24h-YYYY-MM-DD if before 04:00 local
- `今天` / `today` — explicit calendar today, no auto-switch
- `昨天` / `yesterday`
- `recent-24h` / `最近 24 小时` / `近 24 小时` — rolling 24h ending now
- `上周` / `last week` / `recent week` (last 7 days)
- `最近 N 天` / `近 N 天` / `last N days`
- `2026-05-27` (single date)
- `2026-05-20..2026-05-27` (range)

## Workflow

Follow these steps in order. Do not skip the critic step.

### Step 1 — Resolve the date range

Run `scripts/resolve_date_range.py` with the user's date expression (pass empty for default `today`):

```bash
~/.claude/skills/cc-reflection/scripts/resolve_date_range.py "<user expression>"
```

Output is one tab-separated line: `<start_utc_iso>\t<end_utc_iso>\t<label>`. Capture all three.

If the user gave no date hint, pass no argument (defaults to today).

### Step 2 — Scan sessions

Run the scan script with the resolved range:

```bash
~/.claude/skills/cc-reflection/scripts/scan_sessions.py \
  --start <start_iso> \
  --end <end_iso> \
  --label <label>
```

Output: a JSON file path on stdout, summary stats on stderr. The JSON contains per-session aggregates (model, tool counts, durations, pushback counts) and `friction_moments` with verbatim user-pushback snippets, long-turn warnings, and confident-claim flags. All session JSONLs under `~/.claude/projects/` (across all projects) are scanned by default.

To restrict to one project: add `--cwd /Users/liujiaxi/codebase/icc/kox-base`.

### Step 3 — Read the scan JSON

Read the output JSON path with the Read tool. The structured format is designed to fit in context without raw transcript dumps.

If the JSON shows zero sessions in range, stop and tell the user — there is nothing to reflect on. Do not fabricate findings.

**v1.1 — Check `cross_session.thin_sample` flag.** If `true` (set when `total_user_msgs < 10`), the report MUST use **thin-sample mode** (Step 5 has the rules). In thin-sample mode, the report has NO Top-N sections — only single-observation entries with explicit "sample too small to claim a pattern" disclaimers. Padding a thin sample with Top-N findings was the dominant codex critique on v1 (2/10 verdict).

### Step 4 — Optional deep-read for high-friction sessions

If any session has `pushback_count >= 3` OR `tool_errors >= 5` OR `long_turn_count >= 5`, spawn parallel `Explore` subagents (one per session) to read the original JSONL for that session and extract additional verbatim quotes. The subagent prompt:

> Read `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Find every user message containing pushback signals (no/stop/不对/重新/回退/...) and the assistant turn immediately preceding it. Return as structured list: `[{ts, user_quote, prior_assistant_action, surrounding_context_one_line}]`. Maximum 10 items. Verbatim quotes only, no paraphrasing.

Skip this step if no session crosses the thresholds — the scan-level friction_moments are sufficient.

### Step 5 — Draft the report

Apply ALL binding rules from `references/methodology.md`:

1. **Every finding cites verbatim evidence** — session_id + timestamp + literal quote. No exceptions.
2. **Alternatives before commitment** — any "root cause is X" or "pattern is Y" claim must list ≥3 alternative hypotheses with ruled-out reasoning. If 3 plausible alternatives cannot be generated, demote to "observation" without causal claim.
3. **Both fortify and fix sections** — equal weight to patterns worth preserving and patterns worth changing.
4. **Recommendations are diffs** — exact CLAUDE.md additions, hook scripts, or skill scaffolds. "vito should communicate more clearly" is forbidden (see `references/anti-patterns.md` for examples).
5. **Sort by impact** — top section is `(frequency × severity × cost-to-fix)`, not chronological.
6. **v1.1 — §1 ONLY contains real cc × vito collaboration friction.** Skill-self bugs (bugs in scan_sessions.py / SKILL.md / resolve_date_range.py / this very reflection workflow) go to a dedicated `§6 Skill self-exposed bugs` section. Mixing them was the codex E2 critique on v1: "tool QA displaces cc failure". See `anti-patterns.md` #10.
7. **v1.1 — Thin-sample mode.** When `cross_session.thin_sample == true` (or `total_user_msgs < 10` regardless), forbid Top-N sections entirely. Output structure becomes:
   - §1 Observations (numbered, single occurrences only, NO ranking)
   - §2 explicitly: "本期样本量不足以提取固化模式 (user_msgs=N < 10)"
   - §3 Trend comparison: explicitly note thin sample warning
   - §4 Critic summary (still mandatory)
   - §5 raw data appendix
   No "Top 3 高频摩擦" when there's only 1-2 observations. See `anti-patterns.md` #9.
8. **v1.1 — Window honesty.** Header MUST state the *actual observed activity span* (first_ts → last_ts across sessions), not just the nominal scan window. If the nominal window extends into the future (e.g. `today` called at 00:45 covers 23h+ unobserved), add a ⚠️ warning at the top. See `anti-patterns.md` #11.
9. **v1.3 §6.5 — Re-compute denominator before §1/§2/§3.** After reading the scan JSON, identify and subtract excluded sessions from totals before writing the report. Explicitly list the subtraction in the report header table. **Do this before writing any finding in §1/§2/§3 — using raw scan totals is the most common cause of codex E-level critique.**

   | Category | Detection | Action |
   |---|---|---|
   | Non-Claude model sessions | `cross_session.other_agent_sessions` (models_seen all non-claude) | Subtract their user_msgs / pushback / tool_error / long_turn from totals |
   | Reflection-invocation sessions | `cross_session.reflection_invocation_session_ids` (own-session noise) | Subtract their user_msgs / pushback from totals |
   | Duplicate sessions | `cross_session.duplicate_session_count` | Already excluded from cross_session totals by scan script |
   | MiniMax noise | `cross_session.noise_session_count` | Already excluded from cross_session totals by scan script |

   The corrected denominator = `total_user_msgs` − (non-claude session user_msgs) − (reflection-invocation user_msgs). Show this subtraction table prominently in the report header (see `report-template.md`).

Read `references/anti-patterns.md` first to internalize what to avoid. Use the layout in `references/report-template.md`.

### Step 6 — Historical comparison

Before finalizing, list `~/.claude/reflections/` for the most recent prior report. If one exists, Read it and tag each finding:

- `[首次出现]` — new this period
- `[反复出现 N 次]` — seen in N prior reports; include why prior fix didn't work
- `[已改善]` — was in prior report, reduced or absent now

If no prior report exists, write the trends section as `"首次复盘，无对照数据"`.

### Step 7 — Cross-model critic pass (MANDATORY, NON-SKIPPABLE)

The whole skill exists for this step. Do not skip it, do not stub it.

Invoke ONE of these (preference order):

**Preferred — ask-codex (cross-vendor, strongest mitigation):**
Invoke the `ask-codex` skill with the draft report path and this exact critic prompt (translate to English if codex prefers):

> 下面这份复盘报告**假设有 3 个最严重的错误或盲区**——可能是：
> (a) cc 在为自己开脱（把 cc 的失败包装成"系统问题"或"vito 没说清楚"），
> (b) 缺乏证据的结论被当作事实，
> (c) 真正反复出现的高频问题被埋在低频问题里，
> (d) 把 vito 的工作风格误读成 vito 做错了。
> 找出这 3 个错误，给出具体反例 / 证据 / counter-quote。
> 如果你找不出 3 个，再读一遍——报告越流畅越可疑。

**Fallback — second-opinion subagent (heterogeneous Opus instance):**
Invoke the `second-opinion` agent with the same prompt. Weaker mitigation (same model family) but acceptable when ask-codex is unavailable.

**Incorporate the critique into the report:**
For each critic point, decide and document in the "Critic 摘要" section:
- `accepted` — modify the report and record the change location
- `rejected` — record the reasoning for rejection (must cite evidence, not opinion)
- `unresolved` — mark explicitly as open disagreement; carries over to next reflection

### Step 8 — Write and save

Save the final markdown to:

```
~/.claude/reflections/<label>.md
```

Where `<label>` is the label from step 1. v1.1 labels include date-stamped variants for `recent-24h-YYYY-MM-DD` (different from static `today`/`yesterday`/`last-7-days`) so each run produces a distinct file when called repeatedly across days.

If `~/.claude/reflections/<label>.md` already exists from an earlier run today (same label), overwrite (the report is idempotent given the same scan).

Print the saved path and a one-line summary to the user (top findings or "thin-sample observations", count of accepted critiques).

### Step 8.5 — Auto-deliver to vito 飞书 (MANDATORY, v1.2)

复盘报告对 vito 来说不是"保存到磁盘就算交付"，**飞书云文档才是真正的交付**。和 `daily-report` skill 同等对待。**不要问要不要发，直接发。** 用户不需要每次提醒。

**主要交付 — 上传完整报告为飞书 docx (PRIMARY):**

由于 `lark-cli drive +import` 的 `--file` 只接受 cwd-relative 路径（绝对路径会被拒），需要先把报告复制到当前 cwd:

```bash
cp ~/.claude/reflections/<label>.md ./.tmp-reflection-<label>.md
lark-cli drive +import \
  --as user \
  --file .tmp-reflection-<label>.md \
  --type docx \
  --name "CC × Vito 复盘 <human-date-range>"
# 解析返回 JSON 的 .data.url 字段拿到飞书文档链接
rm ./.tmp-reflection-<label>.md
```

`+import` 把本地 md 转成飞书在线 docx，返回包含 `url` (形如 `https://ospysvjnc0.feishu.cn/docx/<token>`)。

**次要交付 — 发一条带链接的消息 (SECONDARY):**

```bash
lark-cli im +messages-send \
  --as user \
  --user-id ou_25c1de3bcec1dfbb34933b9d85d6f6f3 \
  --text "📄 <复盘标题>完整报告: <docx-url>"
```

**单行带链接是默认形态。** 不要发长摘要 — vito 要的是能直接点进去看文档。若 §1 摘要确实有价值 (例如 critic 评分 + umbrella pattern)，可以附在同一条消息一行内 (例: `"📄 昨日复盘 (4/10 codex): <url> — umbrella: cc 缺少 preflight 验证"`)，但**不要拆成多段**。

`ou_25c1de3bcec1dfbb34933b9d85d6f6f3` 是 vito 私聊 open_id (硬编码，与 [[user-open-id]] memory 一致)。

**Failure handling:**
- `+import` 失败 (例如 cwd 不可写、文件太大、token 过期) → inline 报给 vito，附本地路径让他自取，**不要因为上传失败就跳过 Step 9 auto-repair**。
- `+import` 成功但 `+messages-send` 失败 → 把 url 直接打到 stdout 让 vito 手动转发。
- 上传与发消息互相独立，互不阻塞。

### Step 9 — Auto-repair skill self-bugs (v1.1, MANDATORY when §6 has actionable findings)

After saving the report, scan the saved markdown for a `## 6. Skill v1 自暴露的 bug` (or any heading with `Skill` + `bug` + `自暴露` / `self-exposed`) section. If that section contains **at least one finding with a `修复 diff` (or `Fix diff` / fenced code block proposing an edit) targeting files under `~/.claude/skills/cc-reflection/`**, auto-repair WITHOUT asking the user.

**How:** spawn a fresh `general-purpose` Agent (subagent_type=general-purpose). The fix is done by the subagent, not the main agent, for three reasons:
1. Main agent context is already heavy with report content; fresh context produces cleaner diffs.
2. Subagent can iterate (apply → smoke-test → re-apply if regression) without polluting main session.
3. Failure isolation — a botched fix doesn't corrupt the main reflection session.

**Exact subagent invocation:**

```
Agent(
  description="Auto-repair cc-reflection skill self-bugs",
  subagent_type="general-purpose",
  prompt="""
Read the reflection report at <REPORT_PATH>. Locate the §6 section
(heading contains "Skill" + "bug" + "自暴露" or "self-exposed").

For each finding in §6 that has a `修复 diff` subsection or fenced code
block proposing concrete code changes:

1. Apply the diff to the target file. Scope is strictly limited to:
   - ~/.claude/skills/cc-reflection/scripts/*.py
   - ~/.claude/skills/cc-reflection/SKILL.md
   - ~/.claude/skills/cc-reflection/references/*.md
   DO NOT modify ~/.claude/CLAUDE.md, settings.json, hooks, or any
   file outside the cc-reflection skill directory. If §6 proposes
   changes to those, list them in your final report as "requires
   user approval" and do NOT apply them.

2. After all applicable diffs are applied, smoke-test by re-running:
     ~/.claude/skills/cc-reflection/scripts/resolve_date_range.py
     ~/.claude/skills/cc-reflection/scripts/scan_sessions.py \\
       --start 2026-05-26T16:00:00Z --end 2026-05-27T16:00:00Z \\
       --label v11-autorepair-smoketest
   Verify the scan exits 0 and the JSON parses.

3. Return a structured summary:
   - APPLIED: list of (file:lines) actually edited
   - SKIPPED: list of (finding-id, reason) for findings outside scope
     or whose diff was unsafe / incomplete
   - SMOKE-TEST: pass/fail + stderr summary
   - REGRESSIONS: any new behavior change beyond the diff intent

Do NOT git commit. Do NOT trigger another reflection. Report only.
Under 400 words.
"""
)
```

Replace `<REPORT_PATH>` with the actual saved path from Step 8.

**Trigger conditions (binding):**
- §6 exists AND contains ≥ 1 fenced code block proposing a diff to a file under `~/.claude/skills/cc-reflection/` → trigger
- §6 is absent OR contains only "requires user approval" items → skip, mention in final summary
- §6 contains only diffs to `~/.claude/CLAUDE.md`, settings, or hooks → skip auto-repair, surface "vito 决策" items to user

**Anti-loop guard:** auto-repair triggers AT MOST ONCE per reflection run. The subagent's output is NOT fed back as a new reflection. Vito tests the repair in a fresh session.

**Why no user prompt:** vito explicitly authorized this in v1.1 design ("完成报告后自我修复不需要我过问"). Meta-bugs in the reflection skill itself are deterministic to fix (the report already contains the diff), and asking each time defeats the autonomy goal. User-facing changes (CLAUDE.md / hooks) still require approval.

## Critical defaults and conventions

- **Date range default:** today (local timezone); auto-switches to `recent-24h-YYYY-MM-DD` when called before 04:00 local (v1.1).
- **Project scope default:** all projects (`~/.claude/projects/**`). Use `--cwd` only when user explicitly scopes to one project.
- **Output location:** `~/.claude/reflections/<label>.md`. Raw scan cache: `~/.claude/reflections/.cache/scan-<label>.json`.
- **Critic is non-optional.** A report without the "Critic 摘要" section is invalid output. This is the entire reason for the skill's existence.
- **No fabricated quotes.** Every quote must trace to a real JSONL line. If the scan didn't surface a quote for a claim, drop the claim, don't invent the quote.
- **Thin sample → sparse output (v1.1).** When `user_msgs < 10`, report MUST NOT have Top-N sections. Pad-to-look-impressive was the dominant v1 failure mode.
- **Skill bugs go to §6, not §1 (v1.1).** §1 is reserved for real cc × vito collaboration friction. Bugs in the scan/resolve scripts are meta-findings and belong in a separate section.
- **Window honesty (v1.1).** Header lists both nominal scan window AND actual observed activity span. ⚠️ warning when nominal window extends into the future.
- **Auto-repair skill self-bugs (v1.1).** When §6 of the saved report contains diffs targeting `~/.claude/skills/cc-reflection/**`, spawn a fresh general-purpose subagent to apply them — without asking the user. Scope strictly limited to the skill's own files; CLAUDE.md / hooks / settings changes still require approval. See Step 9.
- **Auto-deliver to 飞书 (v1.2).** 报告保存后立即 (a) 用 `lark-cli drive +import --type docx` 把完整 md 上传为飞书在线文档 (primary delivery)，(b) 用 `lark-cli im +messages-send --text` 给 vito 私聊发一行带文档链接的消息 (secondary delivery)。不要发长摘要 — vito 要点进去看文档。复盘类产出和 daily-report 同等对待。See Step 8.5.

## Resources

### Scripts (`scripts/`)

- **`resolve_date_range.py`** — parse human date expression → UTC ISO start/end + label. Supports `today`, `yesterday`, `last week`, `last N days`, `2026-05-27`, `2026-05-20..2026-05-27`, Chinese variants.
- **`scan_sessions.py`** — scan JSONL files in range, output structured JSON. Auto-detects user pushbacks, tool errors, long turns, confident-claim words. Recurses into subagent JSONLs.

### References (`references/`)

- **`methodology.md`** — the three LLM failure modes this skill prevents, research citations, the five binding workflow rules, and the literal critic prompt template. Read this first when running the skill.
- **`anti-patterns.md`** — eight concrete examples of bad reflection writing with good/bad pairs. Read before drafting the report.
- **`report-template.md`** — canonical six-section report layout (高频摩擦 / 应固化 / 趋势对照 / Critic 摘要 / 附录 / 扫描元数据). Use as the literal scaffold.

## Quick reference — one-shot for "today"

```bash
RANGE=$(~/.claude/skills/cc-reflection/scripts/resolve_date_range.py)
START=$(echo "$RANGE" | cut -f1); END=$(echo "$RANGE" | cut -f2); LABEL=$(echo "$RANGE" | cut -f3)
~/.claude/skills/cc-reflection/scripts/scan_sessions.py --start "$START" --end "$END" --label "$LABEL"
# → prints path to scan JSON. Read it, then follow steps 4-8.
```
