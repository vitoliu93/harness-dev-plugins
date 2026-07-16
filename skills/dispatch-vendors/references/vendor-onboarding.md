# Vendor 驾驭摸排指南 — 接入新 vendor 的十级梯子

方法论:2026-07-16 用 dscode/arkcode/opencode/cursor-agent 四引擎全量实战
提炼。每级从便宜到贵,**当级不过不上下一级**;每级都有"通过判据"和"已知坑
形态"。全部爬完才有资格进 vendor sheet 和路由表——没爬完的 vendor 是定时炸弹
(本指南里每一条坑都是真实炸过的)。

## 梯子

### ① 形态勘察(免费)
`type <cli>` + `command -v`:二进制还是 shell 函数?函数在哪个 rc 文件?
- 判据:知道调用要不要 `zsh -ic` 包裹。
- 坑形态:dscode/arkcode 是 `~/.zshrc` 函数,`source ~/.zshenv &&` 前缀
  直接 exit 127。key 注入路径同时查清(`~/.zshenv`?wrapper 内嵌?)。

### ② 文本探针(几分钱)
`<cli> <run> "reply with exactly: ok" <json-flag>`,不带任何工具需求。
- 判据:拿到 ok + session id 的**精确位置**(claude binary: result 消息
  `session_id`;opencode: 每行事件 `sessionID`;cursor: JSON 里 chatId)
  + stdout/stderr 卫生(永不 `2>&1`)。
- 坑形态:模型槽位继承 settings 默认值——claude binary 变体必须显式
  `--model`,否则 fable/opus 槽不被 wrapper 重映射,后端 400 "model not
  exist"(arkcode 实证)。

### ③ 权限旗标(几分钱)
派一个"读一个文件然后回话"的最小工具任务,找 unattended 旗标。
- 判据:任务真实读到文件。旗标名单:opencode `--auto`(读任务也要!)、
  cursor `--force`(写)+`--trust`(未信任目录连 plan 模式都要)、claude
  binary `--permission-mode bypassPermissions`(变体 wrapper 已带,勿重复
  传——last-flag-wins 会静默降级)。
- 坑形态:**静默空转**——opencode 无 `--auto` 时 step_finish
  `tokens.total=0`、exit 0、零输出;cursor 无 `--trust` 时 exit 0、stdout
  空、Trust 提示在 stderr。两者都不报错,必须主动验尸。

### ④ 续连(几分钱)
探针 session 上发第二句,验证上下文存活。
- 判据:同 id 接上、记得前文。resume 旗标:claude binary `-r <id>`、
  opencode `-s <id>`、cursor `--resume <chatId>`。
- 坑形态:续连救不回没产出的内容(0-token session 续连大概率再空转);
  未产出内容也不落本地库。

### ⑤ 判活后门(免费)
找到 session 的磁盘落点,挂死时判断"干完没吐"还是"真死"。
- 已知落点:claude binary `~/.claude/projects/<cwd-slug>/*.jsonl`;
  cursor `~/.cursor/chats/<hash>/<chatId>/`(meta.json 时间戳+store.db
  体积);opencode `~/.local/share/opencode/opencode.db`(part 表)。
- 判据:能用 mtime/体积区分两种挂死,并对"干完没吐"型用 ④ 收割
  (cursor 20 分钟挂死 3 分钟救回,实证)。

### ⑥ 写链路(便宜,真任务)
**自己建 git worktree**,派一个有真实价值的小写任务(如给某脚本写
stdlib 单测),简报带机器可跑的验收命令。
- 判据:验收命令**由我亲跑**通过 + `git status` 除目标文件外零污染。
- 坑形态:cursor 原生 `-w` headless 会在建完 worktree 后挂在会话启动前
  (banner 后零事件)——隔离自己做,别用它的。

### ⑦ 模态矩阵(便宜)
一张含文字+图形的 PNG,让 vendor 用文件工具读图转录。
- 判据:记录三态之一:**能**(转录对)/**优雅降级**(工具层拦截,run
  存活可回话,deepseek 形态)/**致命**(image 块直达 API,400 整 run 死,
  glm-via-Ark 形态)。致命型的 vendor 派活前必须过滤掉图像输入。

### ⑧ 输出行为(便宜)
长输出任务探 flush 与上限。
- 判据:知道 json 是"退出才 flush"(挂死=全丢)还是流式;知道单 turn
  输出上限。已证:claude binary `--output-format json` 攒到退出,
  `stream-json` 逐事件落盘(且顺带暴露 hook 事件,可观测性白送);
  opencode 单 turn ~4096 输出上限且截断文本不落库。
- 纪律:重要产出**让 vendor 写文件**,stdout 只回执;默认用流式格式。

### ⑨ 逐模型定罪(关键心法)
**CLI 不是一个东西,CLI×model 才是。** 同一 opencode:kimi-k2.7-code
稳定 0-token 空转(三次实证)、glm-5.2 可用但有 ⑧ 的上限、
doubao-seed-2.0-pro 全能含视觉。结论按 CLI×model 记,failover 链也按
这个粒度排。

### ⑩ 入册
全部爬完才做:vendor sheet(references/<cli>.md,含每条实证坑)+
scenarios.md 路由行 + ledger 记账习惯 + 观察期(一个月真实使用回看)。

## 当前舰队模态/能力矩阵(2026-07-16 实测)

| CLI × model | 工具写链路 | 视觉 | 输出纪律 | 判定 |
|---|---|---|---|---|
| dscode × deepseek-v4-flash | ✅ 49 测试真仓验证 | ❌ 优雅降级 | json 退出 flush,stream 可用 | 主力打字员+测试作者 |
| arkcode × glm-5.2[1m] | ✅(探针级) | ❌ **致命 400** | 同上 | dscode 限流备胎,禁图像 |
| opencode × kimi-k2.7-code | ❌ 0-token 空转(×3) | 未测 | — | **禁用,勿再派** |
| opencode × glm-5.2 | ✅ | 未测 | ~4096 上限,写文件规避 | 可用,产出必须写文件 |
| opencode × doubao-seed-2.0-pro | ✅ | ✅ 完美 | 未探上限 | 视觉任务次选 |
| cursor × composer-2.5 | ✅(勘察+写) | ✅ 完美 | json 会挂死,**用 stream-json/text** | 勘察主力+视觉主力(≈sonnet 档) |
| cursor × grok-4.5-high | ✅ 对抗审计 6 发现全带算证 | ✅ 完美 | 同 cursor;plan 模式交付物在 `createPlanToolCall` 事件里,不在 result 字段 | 硬任务/红队升级位(≈opus 档) |
| cursor × gpt-5.5 | 未测(premium) | 官方支持,未实测 | 同 cursor | grok 的同档替补 |

**cursor 档位心法**:composer-2.5 当 sonnet 用(日常勘察/写),
grok-4.5-high 当 opus 用(对抗审计/硬推理)——实测 grok 审 deepseek 写的
测试,抓出 2 处假断言+scorer 本体 2 个公式边界,升档物有所值。
