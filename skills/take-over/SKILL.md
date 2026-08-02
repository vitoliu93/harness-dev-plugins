---
name: take-over
description: >-
  接手前一个 agent 的未竟任务:给一个 session id、大致任务描述或 Gitee issue,借
  ccobs 账本定位原会话,读透其目标/边界/进度/失败尝试后继续干活。Use when the user
  says "take over", "接手", "pick up", "continue <session/任务>", "上个 agent
  额度用完了/挂了,你来继续", or pastes a session id / issue to continue. 次要模式:
  主动交接存档("handoff", "交接", "save progress")。Formerly handoff — that word
  still routes here. Works across agent CLIs (claude-code/codex/cursor/...)。
argument-hint: "[session-id | 任务关键词 | IJxxxx]"
---

# take-over — 接手上一个 agent 的活

核心事实:**会话 transcript 本身就是交接文档,ccobs 是它的索引。** 上个 agent
额度耗尽或会话中断时不会留下交接文档——也不需要:定位 session,读透,接着干。

## Take over(主流程)

入口三种:session id / 任务描述 / Gitee issue。产出固定:接手简报 + 继续干活。

### 0. 先同步账本

很近的会话可能尚未灌库,先跑一次增量(幂等、秒级、随时可重复):

```bash
bun ${CLAUDE_SKILL_DIR}/../ccobs/scripts/ingest.ts
```

脚本不存在(没装 ccobs)→ 不报错,直接用下面的 glob 兜底。

### 1. 定位 session

```bash
sqlite3 -header ~/.claude/observability/obs.db \
  "SELECT session_id, source, kind, cwd, git_branch, ended_at, file_path
   FROM sessions WHERE session_id LIKE '%<片段>%'"
```

- **给了 session id**(全量或前缀):上面直接查,拿到 `source/cwd/file_path`。
  无 ccobs 兜底:`ls ~/.claude/projects/*/<id>*.jsonl`(仅 claude-code)。
- **给了任务描述**:两路探——
  1. 语义层(仅 claude-code 持续蒸馏,recall 同款,关键词中英都试):
     `observations.summary LIKE '%<关键词>%'` JOIN sessions,按 started_at DESC;
  2. 事实层:sessions 按 `project LIKE '%<repo>%'` + ended_at DESC 列最近
     ~10 条 `kind='main'`,再用标题对号(claude-code):
     `jq -r 'select(.type=="ai-title").aiTitle' <file_path> | tail -1`

  候选多于 1 条 → 列表给用户挑,别猜。
- **给了 Gitee issue**(IJxxxx / URL):委派 `gitee-operator` 子代理取 issue
  标题+正文(inline gitee-ent MCP 会被 guard 拦),提取关键词走「任务描述」路;
  issue ident 本身也当关键词查一遍——原会话 prompt 里常出现。

注意 `cwd` 可能不是当前目录——接手后一切操作以原会话的 cwd 为准。

### 2. 读透上下文(核心步骤,别略读)

信息源按优先级,高优先级命中就少啃 transcript:

1. **advanced-plan 计划**:`<cwd>/docs/advanced-plans/` 下有相关 slug → 计划即
   交接文档,改走 advanced-plan 的恢复流程(「继续 <slug>」),本 skill 退位。
2. **遗留交接文档**:`ls ~/tmp/handoff-*.md` 有匹配 → 直接读。
3. **transcript 正文**(按 source;file_path 从第 1 步拿):
   - claude-code(JSONL),四个探针(已实测):

     ```bash
     # 真实用户消息 = 目标 + 边界 + 每次纠正(必须逐条吸收)
     jq -r 'select(.type=="user" and .isSidechain!=true) | .message.content
            | if type=="array" then map(select(.type=="text")|.text)|join("\n") else . end
            | select(length>0)' <f> | grep -v '^<'
     # assistant 叙事 = 决策与理由
     jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text").text' <f>
     # 动过哪些文件
     jq -r 'select(.type=="assistant") | .message.content[]?
            | select(.type=="tool_use" and (.name=="Edit" or .name=="Write")).input.file_path' <f> | sort -u
     # 断在哪(额度死点/中断现场)
     tail -50 <f>
     ```

     transcript >1MB → 别在主上下文硬读:spawn 一个 sonnet 子代理跑上述探针、
     返回结构化简报,主上下文只亲读 tail + 动过的关键文件。
   - cursor-ide / cursor-agent:正文在 obs.db `message_parts`,查询模板见
     ccobs SKILL「cursor 系正文查询」节。
   - codex / droid / grok / opencode:file_path 指向原始存储,事件 schema 各异,
     先 head 几行摸清结构,再套同样的三问(用户消息/助手叙事/结尾)。
4. **git 落地事实**(最终裁决):

   ```bash
   git -C <cwd> status; git -C <cwd> log --oneline -15; git -C <cwd> worktree list
   ```

   transcript 说做了 X,git 说 X 是否真落地。冲突时信 git。

### 3. 接手简报(动手前强制输出)

- **目标与动机**:为什么起这个任务
- **边界**:用户在原会话明确说过的约束/纠正,逐条列——这是最容易丢的
- **进度**:已完成(git 实证)/ 进行中 / 未开始
- **失败尝试**:试过什么、为何不行(别重蹈)
- **下一步**:优先级排序

简报后直接继续干活;只有目标或边界仍有歧义才问用户。

### 铁律

- **召回即怀疑**:observations.summary 是线索不是事实,结论以 transcript + git 为准。
- **用户纠正 = 边界**:transcript 里每次「不对/不要/换成」都必须进简报。
- **git 已落地的不重做。**

## Save(次要:主动交接存档)

Trigger: "handoff" / "交接" / "save progress",以及**额度将尽预警**——用户说
"额度/quota 快用完了"、"kimi 额度马上耗光"、"马上要限流" 时,不等追问,立刻
主动写存档(实测案例:用户连问三次才拿到交接文件,预警本身就是触发词)。
额度已经耗尽、会话已死的场景轮不到它,走上面的 take over。

写 `~/tmp/handoff-<YYYY-MM-DD>-<project>-<短标题>.md`(全局 `~/tmp/`:跨仓、
跨 CLI、不进任何 repo、worktree 删了也在)。结构:

Task Goal / What Was Done(含 why)/ Current State / Known Issues /
Failed Attempts / Discoveries(业务规则、API 怪癖、用户明说的约束)/
Next Steps / Key Files / Gotchas

铁律:为零上下文读者写;决策必须带 why;不藏问题;失败尝试必须记。
写完输出两样:①接手指令 `接手 <短标题>`(同为 Claude Code 时);②一行可直接
粘贴到任意其他 agent CLI(Cursor/codex/kimi)的接手话术——
`读 ~/tmp/handoff-<...>.md,按 Next Steps 继续执行,用户约束以 Discoveries 节为准`
——存档在 `~/tmp/` 正是为了跨工具可读,别让用户自己去编这句话。
