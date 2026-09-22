# Todo: Jev Claude Mod

## Current State

- Branch: advanced-plan-2026-09-22-jev-claude-mod
- Baseline: 56a0044
- Status: closed
- Owner: host
- Independent reviewer: opus via orchestrate / delivery；仅验收预审，未参与实现。
- Commit gate: 未获得最终 reviewer PASS，不提交。

## Phases

1. Preflight：官方 API 与本机引擎可用性、原有测试基线、双端入口兼容性。
2. Implement：纯判断逻辑、原生接入、历史读取与旧 recall 去重；针对性测试。
3. Verify：Bun 全量、原生 Mod 测试、真实 Jev 合成样例、双端校验与实际加载。
4. Review and release：冻结 diff，独立 reviewer PASS，版本一致后提交推送；不更新当前 Codex 缓存。

## Evidence

- Claude 2.1.278；CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 时原生 plugin test 可用。
- 原工作树 clean；新 worktree 已建立，尚未修改运行代码。
