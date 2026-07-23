this place store all global skills for claude code, cursor, codex;

## tools config path

claude: `$HOME/.claude`
codex: `$HOME/.codex`
cursor: `$HOME/.cursor`

## publish

- 每次发布必须 bump `.claude-plugin/plugin.json` + `marketplace.json` 版本（否则客户端不感知更新），再 push。skills/ 只通过 plugin 分发，不再往 `~/.agents/skills` 建符号链接。marketplace vito-agents 还托管 study-kit（github source），它变更时两仓都要 push。
- 本仓公开：skill 示例引用真实会话时，内部标识（函数名/工单号/模块名/人名）必须虚构化，只保留形状。
