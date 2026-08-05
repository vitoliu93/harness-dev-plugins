# Archive and resume modes

## RESUME.md format

One file per project root `<项目根>/RESUME.md`:

```markdown
# 存档 — <项目名> 学习进度
> 目标行: … (study-coach sets; this skill read-only)
> CWD: /abs/path/to/project/root

## 当前主线: <主题>
## 我在哪
## 下一步 (15 min)
## 卡点
## 存档历史
- YYYY-MM-DD [主题]: … (推进|原地)
```

## Mode 1 — 存档

1. **Evidence first**: harvest sessions, git diff since last 存档 commit, recent files.
   ```bash
   python3 ${CLAUDE_SKILL_DIR}/scripts/harvest_sessions.py <CWD> --since <date>
   ```
2. **Active recall**: up to 4 questions, one at a time; "don't know" is valid.
3. **L2 check**: drift, (推进|原地), silent 卡点 on false confidence.
4. AI writes RESUME.md; commit in repo with `存档 YYYY-MM-DD [主题]`.
   Never `git init` at collection root with nested clones.

## Mode 2 — 读档

1. Read RESUME.md; reconcile files vs archive.
2. If gap >1d, run harvest; ask about offline study.
3. 30s recap: days since last, last topic, 卡点, next step.
4. Optional light warmup on 卡点; then stay quiet until 存档.

## Temperature (both modes)

Evidence-based praise · report real days only · slope over absolute · interruptions are normal.
Deep motivation → study-coach.

## Rules

- RESUME.md only; one next step; history append-only.
- Missing/corrupt file → rebuild from evidence; placeholder goal only.
