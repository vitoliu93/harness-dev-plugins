# Goal: Jev Claude Mod

## Goal

通过 Claude Mod，在用户提交提示时结合会话上下文推荐是否委派及可用 agent，并选择最多三个有价值的历史参照。

## 参考真源

- docs/refs/jev-claude-mod/official-mods.md：Anthropic 官方 Mods 说明，读取于 2026-09-22。
- 官方运行类型：https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts（下载版由 Claude 2.1.277 生成；本机运行验收为 2.1.278）。
- https://docs.typesafe.ai/primitives/choice
- https://docs.typesafe.ai/primitives/noul
- AGENTS.md；现有 orchestrate、use-agents 与 recall 的职责边界。

## Done means

- 新判断使用原生 function hooks，读取会话、调用 Jev、注入结果均通过 Claude Mod API。
- 路由只从本机可用候选中选；自做、无法判断是有效结果；不自行启动 agents 或扩大权限。
- recall 每次用户任务输入均可重新判断，包含近期上下文；只返回实际候选的原文入口，不把历史结论当事实。
- 默认不向外部模型发送会话；显式开启后才发送有界、脱敏的文本。缺密钥、不可用、超时或坏响应不阻塞提示。
- Claude 的新旧 recall 不重复，Codex 原有行为保持不变。
- 本地测试、原生 Mod 引擎测试、真实 API 样例、双端插件校验及独立 reviewer PASS 完成，才提交发布。

## Explicitly out of scope

- 不做个人偏好学习，不替代独立审查，不自动派人、审批或发布。
- 不复制双端技能，不改全局用户配置或当前 Codex 插件缓存。
- 不将真实个人路由、密钥、会话样本提交到公开仓库。
