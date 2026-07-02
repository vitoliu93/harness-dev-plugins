# 北极星 · Agent Coding Factory

> 2026-07-02 立项。基于 26-agent 调研:自有技能栈审计 + 17 个近期 session 消化 + 5 个参考项目
> (hermes-agent / claude-mem / motus / Trellis / pro-workflow) 机制挖掘 + 本机引擎盘点。

## 北极星目标

**每一个任务,无论大小,都走同一条「需求 → 实现 → 收盘」流水线;每次收盘都让下一个任务更便宜、更快、更准。**

进步的单位不是"完成了多少任务",而是"每个任务给系统留下了多少复利"(compound engineering)。

三个可度量的代理指标:

| 指标 | 现状(调研实测) | 方向 |
|---|---|---|
| 知识沉淀率:任务收盘时写回 memory/skill/归档 的比例 | ~0%(代码沉淀 65%,知识沉淀几乎为零) | ↑ |
| 廉价算力占比:执行类 token 跑在非 Anthropic 引擎上的比例 | ~0%(dscode/droid/cursor-agent 均未系统化调用) | ↑ |
| 纠偏次数:每任务用户纠正(不对/重新/错了)的次数 | 长 session 中 35+ | ↓ |

## 分层架构(组件映射)

```
编排层   ship(自适应 SOP,S/M/L 分级)· dispatch(跨引擎派活)
战术层   advanced-plan · grill-me · ask-ai · worktree(约定+安全)
执行层   ship-tester · ship-analyst · code-search · 外部引擎(dscode/droid/cursor-agent/codex)
项目层   kox 等项目插件的 tester / deployer / finalizer —— 经 ship 扩展点挂接
沉淀层   debrief(收盘三件套)· memory(带生命周期)· yao-meta-skill(技能铸造)
基座     session jsonl 全量日志 —— "The log is the agent",一切沉淀都是日志上的投影
```

## 调研核心结论(设计依据)

1. **ship 的病不是"重",是"单体"**。S 任务(6/17)根本不该走全流程,但 4/6 的 L 任务
   也没走——因为启动成本吓退了使用。解法是 motus/Trellis 式的:同一技能内做尺寸门控
   (sizing gate)+ 阶段跳过矩阵,而不是拆成多个技能。
2. **收盘 = 三个正交动作**(Trellis):归档(archive)、蒸馏(distill → memory)、
   固化(promote → skill)。各自幂等、可跳过,合成一个 debrief 技能。
3. **全局×项目粘连的正确形状是"具名扩展点"**,不是硬编码。ship Stage 1a 已经隐式依赖
   kox 的 gitee-operator(未声明,出了 kox 环境即静默断裂)——需求真实存在,只差显式化:
   ship 定义 issue-context / verify / deploy / finalize 四个扩展点,按角色关键词解析到
   项目级 agent,缺省回退内置行为。
4. **跨引擎编排第一步是"引擎卡片 + 简报契约",不是调度系统**。dscode/arkcode 就是 claude
   二进制换后端——整个插件生态原样可用、配额独立,这是独有优势。hermes 的铁律直接采纳:
   子代理零上下文,一切事实写进简报。完成判定看退出码和 git diff,永不信引擎自述(Trellis)。
5. **memory 的病不是量,是没有生命周期**。150 个文件多为事故日记,无 status 字段,过期
   断言永久存活;agent-plugins 自己只有 3 条记忆。契约:每任务收盘至多写一条,带
   `status: active|superseded|resolved`,第三次重复出现的模式进 SKILL-CANDIDATES.md
   (open lessons == open skills)。
6. **worktree 技能不冗余但要瘦身**(已核实):强制隔离只发生在 background session;
   主会话和普通 subagent 不自动隔离。机制已内置,技能保留"branch 即身份"约定 +
   退出安全序(这是 session 摩擦榜第 1 名)。headless `claude -p` 与交互式共享 5h 配额
   ——廉价算力只能来自外部引擎。

## 路线图

- **v1.10(本次)**:ship 尺寸门控 + 扩展点;debrief 收盘技能;dispatch 派活技能 + 引擎
  卡片;worktree 瘦身修正;advanced-plan 模板路径可移植性修复。全部纯 prompt,零新基建。
- **v1.11(钩子化)**:Stop 钩子正则捕获 `[LEARN]` 标记自动写 memory(pro-workflow);
  SessionStart 注入"上次教训回放";worktree 退出安全序 PreToolUse 校验。
- **v1.12(自动化)**:skill 保鲜度报告 + 路由重叠检查 —— 引擎直接采用 yao-meta-skill
  上游仓库(~/codebase/github/yao-meta-skill)的 `build_skill_atlas.py`(Jaccard 路由
  重叠矩阵 + cadence 陈旧度)、`trigger_eval.py`(描述触发评测,fixture 格式
  `evals/trigger_cases.json`:should/should-not/near-neighbor)、`context_sizer.py`
  (token 预算)——全部 stdlib-only、离线、已实测可跑,不必自建;skill bundles
  (一个 YAML 组合 N 个技能应对固定场景);dispatch 的 workflow 模板化
  (计划→多引擎并行→验收)。
- **观察项(刻意不做)**:SQLite/向量库记忆基建(flat markdown + grep 够用)、常驻
  daemon、每轮后台反思 fork、跨 16 平台分发 —— 参考项目验证过的过度工程,solo 场景不碰。

## 演进原则

不追求完美,追求每次迭代可用。凡是"第三次手动做同样的事",就是下一个技能候选。
