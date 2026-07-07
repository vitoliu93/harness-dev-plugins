# LEARNED — raw inbox (auto-captured by learn-capture hook; graduate via /debrief)
- 2026-07-03 [hook] skill-guard 跳过自定义 provider
- 2026-07-06 [project] dispatch/ship 定位是人监督的派活系统，不是自主 agent loop——每 item 重派额度 1 次后必须停下交用户接管；Tier 2 验证仅条件触发不默认跑；引擎/模型/梯位只写在 engines.md registry，SKILL.md 零硬编码
- 2026-07-06 [project] dispatch 容错定位是"有界自主"——每 item 重派额度 2 次，额度用完标 [blocked] 挂起不阻塞其他 item、收尾汇总；不做停机等人，也不做无限自愈循环
- 2026-07-06 [user] 脚本运行时选型顺序：bun 优先（bun:sqlite 内置），其次 uv，最后才是裸 Python
- 2026-07-06 [project] ccobs distill provider 顺序 deepseek > gemini(gemini-3.1-flash-lite) > openrouter(openrouter/free) > lmstudio，key 走环境变量，llm.json 显式覆盖
- 2026-07-08 [project] 用户工作流是任务直接进 /ship、极少先聊再干——新的 pre-work 类技巧（盲区扫描等）必须接线到 ship 阶段内自动触发，不能只做 standalone skill 等用户手动调用
- 2026-07-08 [feedback] grill-me 的目的是对齐认知而非收集投票——先摆出经数据验证的完整立场再请用户指出出入；用户自述的摩擦感受可能有记忆偏差，委派/成本类判断以 ccobs SQLite 数据为准。
