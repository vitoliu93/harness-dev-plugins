this place store all global skills for claude code, cursor, codex;

## tools config path

claude: `$HOME/.claude`
codex: `$HOME/.codex`
cursor: `$HOME/.cursor`

## publish

- 改了 `skills/*/` 任意 skill surface 后，commit 前先跑 `bun skills/skill-forge/scripts/build_skill_atlas.ts --workspace-root skills --fail-on-style`；事件档过期或 runtime Skill & Doc Style 有 finding 都会被 atlas gate 拦截。deny 会终止整条 `&&` 链，拆开单独重跑。
- 每次发布必须 bump `.claude-plugin/plugin.json` + `marketplace.json` 版本（否则客户端不感知更新），再 push。skills/ 只通过 plugin 分发，不再往 `~/.agents/skills` 建符号链接。marketplace vito-agents 现在只托管 dev-kit 一个插件（study-kit 已于 2026-07-28 整仓并入，远程仓归档只读），发布不再需要跨仓同步。
- 本仓公开：skill 示例引用真实会话时，内部标识（函数名/工单号/模块名/人名）必须虚构化，只保留形状。
