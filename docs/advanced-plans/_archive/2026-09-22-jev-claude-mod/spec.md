# Spec: Jev Claude Mod

## Approach

原生 prompt.submit 接收当前提示与最近文本，按本机 agents 配置形成候选；读取 ccobs 的历史摘要作为 recall 候选。Jev 只输出有界选择和分数。注入内容保留原始提示、来源和现有上下文。模型结果是建议，不是授权。

SQLite 的只读访问可用 Mod 的 process.run 调用一个无模型逻辑的数据读取器；Jev 请求和判断不放在 shell hook。配置和环境读写、网络调用均经过引擎 API。

原生模块与现有命令 hook 同时存在；仅成功承担本轮 recall 时抑制该会话的旧 recall，关闭或失败保留原流程。最终方式以双端实际加载测试为准。

## Affected surfaces

- hooks/jev/：Mod 入口、纯函数、原生引擎测试材料。
- hooks/scripts/：只读历史候选读取器、旧 recall 去重及相应测试。
- hooks/hooks.json、Claude manifest：入口与显式启用配置。
- README 与版本清单：使用说明和同步版本。

## Key decisions

- 不从模型输出生成命令、路径或 agent 定义；返回 ID 必须属于实际候选。
- 不发送工具输出、密钥或完整会话；保留最低必要文本，限制请求和注入大小。
- 候选配置、额度、团队规则和当前用户指令不能被推荐覆盖。
- 不因模型建议自动调用 orchestrate；实际委派仍由主 agent 按用户授权进行。
- 全量测试之后，冻结 diff 交给未参与实现的 reviewer；PASS 前不提交。

## Risks & open questions

- Function hooks 是早期 API；必须原生加载和运行，不能仅用假对象测试。
- 模型把握度不是真实正确率；小样例只证明链路和基本行为。
- 模块字段对 Codex hook 读取的影响须实际校验；若不能兼容，使用 Claude 专用入口而非复制技能。
