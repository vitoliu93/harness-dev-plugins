# IKBNBJ 修复 ceo-mode 的 Herdr 启动

## 目标

让 `ceo-mode` 能按用户选择通过 Herdr 启动 agents。

## 已定方向

- 默认使用 Herdr 启动 agents，不要求当前会话已有 `HERDR_ENV=1`。
- 在 Herdr 内时使用当前会话；在 Herdr 外时连接本机正在运行的 Herdr。
- 只创建并操作本次任务自己的标签页，不碰已有标签页。
- 仓库规则与用户级 `/Users/liujiaxi/.agents/skills/herdr/SKILL.md` 一起对齐。
- Herdr 不可用时必须明确报错，不得悄悄换成其他启动方式。

## 先查清

- 读取 `ceo-mode`、`orchestrate`、`use-agents` 和 `herdr` 的当前技能文件。
- 读取会话 `66ef9cb8-a25b-4261-83c2-065b13fd9803` 与 `6611d56c-0703-4cfb-b257-ac09ab371198` 的原始记录，只把原始记录当证据。
- 用当前文件和真实命令复现问题，记录失败命令与完整报错。
- 判断问题来自路线选择、启动参数、任务卡传递，还是技能规则冲突。

## 修改边界

- 只做解决问题所需的最小改动，不做额外整理。
- 保持 Claude Code、Codex 与非 Herdr 启动路线原有行为。
- 遵守 `AGENTS.md`；技能保持短，优先删改现有文字，不加不必要文件。
- 不修改安装缓存，修改仓库源文件。
- 用户已经批准修改用户级 `/Users/liujiaxi/.agents/skills/herdr/SKILL.md`；它不属于仓库提交。

## 验收

- 使用 Herdr 的默认方式成功启动一个最小 agent；不传 `--mode`。
- agent 能读到完整任务卡并写出结果文件。
- 运行 `bun test`。
- 运行 `bun skills/skill-forge/scripts/skill_style.ts --workspace-root skills --fail-on-issues`。
- 运行 `bun skills/skill-forge/scripts/build_skill_atlas.ts --workspace-root skills --fail-on-style`。
- 运行 `claude plugin validate --strict .`。
- 运行 `uv run --with pyyaml python "$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" .`。
- 检查 Claude Code 和 Codex 都能载入改后的技能，并至少运行一个带脚本的技能确认路径有效。

## 交付

- 程序员先写结果文件，不提交。
- 独立只读审计必须自己重跑检查；报告写明命令和输出，只引用实际文件的准确行。
- 审计 PASS 后，程序员把三份插件版本改成同一新版本，提交信息带 `IKBNBJ`，推送 `origin/main`。
- 最终说明原因、改动、验收证据、提交号和远端状态。
