# 项目规则

本仓库为 Claude Code 和 Codex 提供同一套插件与技能。`CLAUDE.md` 是唯一的项目规则文件，`AGENTS.md` 必须是指向 `CLAUDE.md` 的软链接，不要复制成两份内容。

## 配置目录

- Claude Code：`$HOME/.claude`
- Codex：`$HOME/.codex`
- Cursor：`$HOME/.cursor`

## 双端兼容

- `skills/` 是 Claude Code 和 Codex 共用的唯一技能来源。不要为两个客户端复制 `SKILL.md`。
- 技能需要运行自带脚本或读取自带文件时，使用有名称的 `*_SKILL_DIR`。模型根据已载入的 `SKILL.md` 路径填写绝对路径，并在同一次 shell 调用中赋值和使用：

  ```bash
  EXAMPLE_SKILL_DIR="<absolute path of the directory containing the loaded SKILL.md>";
  bun "$EXAMPLE_SKILL_DIR/scripts/example.ts"
  ```

- 不要在有效技能文档和引用文件中使用 `${CLAUDE_SKILL_DIR}` 或 `${CLAUDE_PLUGIN_ROOT}`。
- hook 需要插件根目录时，使用 `PLUGIN_DIR="${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}";`，同时支持两端传入的变量。
- 客户端单独设置放在各自文件中，不要拆分共用技能：Claude Code 使用 `.claude-plugin/plugin.json`，Codex 使用 `.codex-plugin/plugin.json` 和可选的 `skills/*/agents/openai.yaml`。
- 根目录 `agents/` 只供 Claude Code 使用。可复用的做法必须放进 `skills/`。
- 新建或修改技能时，必须检查 Claude Code 和 Codex 都能载入技能，并至少运行一个有脚本的技能来确认路径有效。

## 检查

修改 `skills/*/` 后，提交前运行：

```bash
bun test
bun skills/skill-forge/scripts/skill_style.ts --workspace-root skills --fail-on-issues
bun skills/skill-forge/scripts/build_skill_atlas.ts --workspace-root skills --fail-on-style
claude plugin validate --strict .
uv run --with pyyaml python "$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" .
```

如果一条 `&&` 命令中的前一项失败，后面的命令不会执行。修好后要分别重跑。

## 发布

- 每次发布都把 `.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json` 和 `.codex-plugin/plugin.json` 改成同一版本，再提交和推送。否则客户端可能无法发现更新。
- `skills/` 只通过插件分发，不要在 `~/.agents/skills` 创建软链接。
- `vito-agents` marketplace 只托管 `dev-kit`。`study-kit` 已在 2026-07-28 合入本仓库，不需要跨仓库同步。
- 本仓库公开。技能示例引用真实会话时，函数名、工单号、模块名和人名必须改成虚构内容，只保留示例结构。
