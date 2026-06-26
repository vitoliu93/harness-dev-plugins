# Reflection report template

Use this structure for every reflection report. Section headings are literal; subsection counts adapt to data volume.

The report is markdown, saved to `~/.claude/reflections/<label>.md` where `<label>` matches the date-range label (`today`, `yesterday`, `last-7-days`, `recent-24h-2026-05-28`, `2026-05-27`, `2026-05-20_to_2026-05-27`).

## v1.1 — Two report variants

Pick the variant based on scan output:

- **Standard variant** — when `cross_session.thin_sample == false` AND `total_user_msgs >= 10`. Use the full template below.
- **Thin-sample variant** — when `cross_session.thin_sample == true` OR `total_user_msgs < 10`. See `anti-patterns.md` #9 for the structure. No Top-N sections; only single observations. The Critic pass is still mandatory.

In either variant, the header MUST include both the nominal scan window and the actual observed activity span (see `anti-patterns.md` #11).

---

## Standard variant template

```markdown
# CC × Vito 复盘 — <human-readable date range>

> ⚠️ (v1.1: include this block only if nominal window extends beyond now())
> **窗口警告:** 报告生成于 <local ISO>。所选窗口 nominal range 为 <nominal start> → <nominal end>，但实际观察活动仅 <actual first_ts> → <actual last_ts>。其余时段未发生。本复盘代表 "<descriptive window>"，不是完整 <nominal label>。

**扫描范围 (名义):** <start_iso> → <end_iso>
**实际观察活动:** <first_ts_across_sessions> → <last_ts_across_sessions>
**会话数:** <N>  |  **总时长:** <X> min  |  **pushback:** <P>  |  **tool_error flagged+text:** <Ef>+<Et>  |  **confident_claim:** <Cc>
**报告生成:** <ISO timestamp>  |  **critic:** <ask-ai(codex) | second-opinion | both>

---

## 1. 高频摩擦 Top <3-5>

按 (出现次数 × 严重度 × 修复成本) 排序。每条必须有：verbatim 证据、3 个 alternative hypotheses、可执行的修复 diff、历史标签 [首次出现 / 反复出现 N 次 / 已改善]。

### 1.1 <one-line pattern name> [反复出现 2 次]

**证据 (N occurrences):**
- `2026-05-27T14:32` session `abc12345` cwd `~/codebase/icc/kox-base`:
  - vito (verbatim): "<...>"
  - cc 行为: <...>
- `2026-05-27T15:48` session `def67890`: <同上格式>
- ...

**Alternative hypotheses:**
1. <alt 1> — ruled out: <evidence>
2. <alt 2> — ruled out: <evidence>
3. <alt 3> — ruled out: <evidence>

**确定的模式:** <one sentence>

**修复 diff (choose one or more):**
- CLAUDE.md: <file path>, add at line <N>:
  ```
  <exact text to add>
  ```
- Hook: create `~/.claude/hooks/<name>.sh`:
  ```bash
  <exact bash>
  ```
- Skill: extract to `~/.claude/skills/<name>/SKILL.md` (rationale: <...>)

**历史标签:** [反复出现 2 次] — 上次出现在 `2026-05-25.md` 的 "1.3"，建议 <X>，但没生效原因: <Y>。

---

### 1.2 ...

(同结构)

---

## 2. 应固化的模式 Top <2-3>

按 (出现频率 × 复用潜力) 排序。固化方式：写进 user-CLAUDE.md / 项目 CLAUDE.md / skill / hook。

### 2.1 <one-line pattern name>

**证据 (N occurrences):**
- `2026-05-27T11:20` session `xyz45678` (duration 4.5min, 0 pushback):
  - vito prompt (verbatim): "<...>"
  - cc 响应: <one-line summary of why it worked>

**为什么这模式有效:** <one sentence>

**固化 diff:**
- <CLAUDE.md / hook / skill> change

---

### 2.2 ...

---

## 3. 趋势对照 (vs 上次复盘)

对比的上次报告: `~/.claude/reflections/<previous-label>.md` (生成于 <date>)

| Finding | 本次 | 上次 | 趋势 |
|---|---|---|---|
| <pattern A> | 5× | 8× | ↓ 改善 |
| <pattern B> | 3× | — | [首次出现] |
| <pattern C> | 2× | 2× | → 持平 (上次的修复未生效，因为 <reason>) |

若无历史报告：直接写 "首次复盘，无对照数据"。

---

## 4. Critic 摘要

调用了: `<ask-ai(codex) | second-opinion>`，prompt: "假设此报告有 3 个最严重错误..."

| Critique | 处理 | 修改位置 |
|---|---|---|
| <critic 指出的问题 1> | accepted / rejected / unresolved | <修改的 section 编号 / 反驳理由 / 标记的分歧> |
| <critique 2> | ... | ... |
| <critique 3> | ... | ... |

未解决的分歧 (留给下次复盘):
- <如有>

---

## 5. 附录: 单次出现的小问题

(频次 = 1 的 friction moments，仅记录不分析。若下次复盘再出现，移到第 1 节。)

- `<ts>` session `<id>`: <one-line description>
- ...

---

## 6. 扫描元数据

- 命令: `scan_sessions.py --start <...> --end <...>`
- 原始扫描 JSON: `~/.claude/reflections/.cache/scan-<label>.json`
- 扫描文件数: <N>
- 跳过文件数: <M> (mtime 不在范围内)
- 扫描耗时: <X>s
```

## Formatting notes

- All timestamps in ISO local format (with timezone) in the report body, not UTC, for readability.
- `session_id` shown as 8-char prefix for compactness, full UUID only when needed for disambiguation.
- Verbatim quotes preserve language (don't translate Chinese to English or vice versa).
- Never use bullets without timestamps. Anonymous bullets become anti-pattern 1.
