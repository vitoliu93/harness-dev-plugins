# Anti-patterns in reflection reports

Concrete examples of bad reflection writing to avoid. Each shows a real failure mode caused by the LLM biases documented in `methodology.md`.

## Anti-pattern 1: The space-filling generality

**Bad:**
> vito and cc could communicate more clearly. Ambiguous prompts often led to misaligned implementations.

**Why bad:** True of every human-LLM pair ever. Carries zero information. Not falsifiable. No action implied.

**Good:**
> 2026-05-27T14:32, session `abc12345`: vito asked "把那个 bug 修一下" without referencing the file. cc spent 4 turns guessing which bug across 3 different files (`auth.ts`, `session.ts`, `worker.ts`) before vito clarified: "我说的是 auth 那个". Pattern observed 3× this week.
> **Fortify proposal:** add to user-CLAUDE.md: "ambiguous '那个' / 'this bug' references trigger immediate clarification request, do not guess."

## Anti-pattern 2: Self-exculpation disguised as analysis

**Bad:**
> cc occasionally produces incorrect tool calls due to limitations in the model's understanding of complex codebases.

**Why bad:** "Limitations in the model" is cc absolving itself by appealing to a general fact. Doesn't identify what cc did, just that cc is fallible.

**Good:**
> 2026-05-27T15:08, session `def67890`: cc called `Edit` with `replace_all=true` on a function name appearing in 14 places, when vito only wanted the export renamed. Pushback at T+45s: "no I only meant the one in auth.ts". This pattern of cc defaulting to `replace_all=true` on identifier renames appeared 4× across 3 sessions this week.
> **Fix proposal:** add hook on Edit `replace_all=true` calls that injects "verify identifier scope first" before commit.

## Anti-pattern 3: Conclusion without alternatives

**Bad:**
> Root cause of frequent pushbacks: cc moves too fast without confirming approach.

**Why bad:** Single causal claim, no alternatives explored. Could equally be: vito tests more aggressively when he's in a hurry / cc reads cwd wrong / vito's instructions were under-specified / the task was genuinely hard.

**Good:**
> Pattern: 6 pushbacks across 3 sessions this week, all on architectural decisions.
> Alternative hypotheses considered:
> 1. cc moves too fast — ruled out: 4 of 6 had cc proposing approach first before acting.
> 2. vito's prompts were under-specified — partially supported: 3 of 6 prompts lacked architectural constraint, but pushback came after cc made specific (wrong) choice, not before.
> 3. cc anchored on a familiar pattern not matching codebase — strongly supported: 5 of 6 pushbacks involved cc proposing a generic React pattern (e.g., useEffect for data fetch) when the codebase has a custom SWR wrapper.
> **Demoted from "root cause" to:** "observation — cc has pattern-matching bias toward generic solutions in unfamiliar areas of this codebase." Action: extend project CLAUDE.md with "this codebase uses <wrapper>, don't propose plain useEffect for data fetching".

## Anti-pattern 4: Fortify section without evidence

**Bad:**
> What worked well: vito gave clear instructions, cc executed efficiently.

**Why bad:** No specifics, no quotes, no session IDs. Could be written without reading any sessions.

**Good:**
> 2026-05-27T11:20, session `xyz45678`, duration 4.5 min, 0 pushbacks: vito's prompt "在 `apps/web/components/Editor.tsx:142` 把 placeholder 改成 'Untitled' — 不要改 prop 名" matched cc's first commit exactly. The pattern — (a) exact file:line, (b) exact target value, (c) explicit "do not touch X" constraint — should be the template for any one-line UI fix.

## Anti-pattern 5: Buried high-frequency in low-frequency noise

**Bad:**
> Issues observed this week (in order of when noticed):
> 1. cc misread cwd once
> 2. cc forgot to run tests once
> 3. cc proposed wrong React pattern (5×)
> 4. cc used wrong package manager once
> ...

**Why bad:** Item 3 happened 5× but is buried at position 3 in a chronological list. The 5-occurrence pattern is the only one worth fixing this week.

**Good:** Sort by `count × severity × cost-to-fix`. List top 3-5 only; collect singletons in an appendix.

## Anti-pattern 6: Cross-session insight missed

**Bad:** N session summaries, each treated as an island.

**Why bad:** The value of cross-session reflection is finding patterns that no individual session reveals. If the report reads "session 1 did X, session 2 did Y, session 3 did Z" with no synthesis, the agent has done extraction but not reflection.

**Good:** Find at least one finding that requires ≥2 sessions to spot. Example: "cc consistently chooses Read over Bash cat across all sessions today (12/12 cases), confirming the tool-preference shift after CLAUDE.md update on 2026-05-20 is sticky."

## Anti-pattern 7: Reflexive "more communication" recommendation

**Bad:** Recommendations include "vito should provide more context up front" or "cc should ask more clarifying questions".

**Why bad:** These are platitudes. They sound like advice but don't specify *when*, *what*, or *how*.

**Good:** Recommendation must be a diff:
- "Add to user-CLAUDE.md line 47: <exact text>"
- "Create hook at `~/.claude/hooks/<name>.sh` with body: <code>"
- "Promote pattern to skill at `~/.claude/skills/<name>/SKILL.md`"

If you can't write a diff, the recommendation isn't actionable.

## Anti-pattern 8: Cited but quote not verbatim

**Bad:**
> 2026-05-27, session abc, vito asked cc to stop and reconsider the approach.

**Why bad:** Has session ID but no verbatim quote. "Asked to stop and reconsider" could be paraphrasing anything.

**Good:**
> 2026-05-27T13:14, session abc12345, vito (verbatim): "等等，你这个思路不对，先看看 supabase 那边的 trigger 再说"

The quote IS the evidence. Paraphrasing destroys it.

---

# v1.1 additions — based on codex critic (2/10 verdict on v1 report)

## Anti-pattern 9: Thin-sample padding

**Bad:**
> ## 高频摩擦 Top 3
> ### 1.1 <one observation> [首次出现]
> ### 1.2 <another single observation> [首次出现]
> ### 1.3 <third single observation> [首次出现]
>
> (total user_msgs across all sessions today: 7. total pushbacks: 1.)

**Why bad:** "Top 3 高频摩擦" implies the entries are *frequent* and *ranked by impact*. With 7 total user msgs and 1 pushback, no entry can credibly be "high frequency". Three singleton observations sorted is not the same as a Top 3 — it's an enumeration disguised as a ranking. Codex on v1: *"adverse evidence is reframed as ... process success."*

**Good (thin-sample mode):**
> ## 本期观察 (sample 太小，未能形成 Top-N 模式)
>
> 本期 `user_msgs=7 < 10`，触发 thin-sample mode。以下为单次观察，**不构成 Top-N 高频摩擦**。下次复盘若同类观察重复出现，再升级为 §1 finding。
>
> ### 观察 A — <一句概括>
> [verbatim 证据]
>
> ### 观察 B — ...
>
> ## 应固化的模式
> 本期样本量不足以提取固化模式 (n=7 user msgs < 10)。

**Trigger condition (binding):** when `cross_session.thin_sample == true` OR `total_user_msgs < 10`, switch to this format. Never write "Top 3" / "Top 5" headers in thin-sample mode.

## Anti-pattern 10: Tool QA displaces protagonist failures

**Bad:**
> ## 1. 高频摩擦 Top 3
> ### 1.1 cc 提出系统级方案跳过 doc check [真实 cc×vito 摩擦]
> ### 1.2 scan_sessions.py 漏检 pushback [skill 自身 bug]
> ### 1.3 scan_sessions.py tool_error 计数偏低 [skill 自身 bug]

**Why bad:** §1 is supposed to surface real cc × vito collaboration friction. Listing 2 skill-implementation bugs alongside 1 real friction in the same Top 3 inflates the section to look comprehensive while diluting the actual protagonist signal. Codex on v1: *"two Top 3 items are 'scan_sessions.py' defects ... '高频摩擦' buries cc behavior."*

**Good (physical separation):**
> ## 1. cc × vito 协作摩擦 (本期只有 1 条)
> ### 1.1 cc 提出系统级方案跳过 doc check
> ...
> ## 6. Skill v1 自暴露的 bug (元 finding — 不计入 §1)
> ### 6.1 scan_sessions.py 漏检 pushback
> ### 6.2 scan_sessions.py tool_error 计数偏低
> ...

**Rule (binding):** §1 ("高频摩擦") and §6 ("Skill self-exposed bugs") are physically separate sections. Skill self-bugs are valuable but they're not vito's protagonist behavior. Don't mix them.

## Anti-pattern 11: Reporting an unobserved future window

**Bad:**
> # CC × Vito 复盘 — today
> **扫描范围:** 2026-05-28 00:00 → 2026-05-28 24:00 (本地)
> **会话数:** 2 | **总时长:** 73 min
>
> ## 高频摩擦 Top 3 ...

(Report generated at local time 00:45 — but the header implies a full day of observation.)

**Why bad:** The nominal "today 00:00 → 24:00" window covers 23h+ in the future where no data exists yet. The reader (or the skill's own historical-comparison logic) treats this as "a full day's reflection" when it's actually 30-40 min of pre-dawn activity. Codex on v1: *"It reports an unobserved future day ... most daily counts were unknowable."* This is also why the v1.1 script auto-switches to `recent-24h` when called before 04:00 local.

**Good:**
> # CC × Vito 复盘 — recent-24h-2026-05-28 (实际活动 38 min)
>
> > ⚠️ **窗口警告:** 报告生成于本地 2026-05-28 00:45。所选窗口 nominal range 为 2026-05-28 00:00 → 24:00，但实际观察到的活动仅 00:03 → 00:42。其余 23h 未发生。本复盘代表"今日凌晨工作段"，不是完整一日。
>
> **扫描范围 (名义):** ...
> **实际观察活动范围:** 2026-05-28T00:03 → 2026-05-28T00:42 (38.5 min)

**Rule (binding):** header MUST list BOTH the nominal scan window AND the actual observed activity span (computed from `first_ts` and `last_ts` across all sessions in scan output). If nominal window extends beyond `now()`, add ⚠️ warning.
