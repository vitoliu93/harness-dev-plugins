---
name: skill-forge
description: >-
  铸造或改良一个 skill(消化自 yao-meta-skill 的单人版方法):先过资格门
  (该不该建)、trigger-first 先写 description 并跑触发评测到 P=R=1.0、
  正文按资源边界放置(≤700 tokens,细节进 references/,确定性步骤进
  scripts/)、收尾登记 call-site 并恰好列三个迭代方向。自带 vendored
  评测工具链(trigger_eval / context_sizer / build_skill_atlas,供
  skill-atlas 复用)。Trigger: "铸造技能"、"建个 skill"、"create a skill"、
  "improve this skill"、debrief 技能候选满 3 次毕业时。负例:舰队级
  体检/路由重叠扫描走 skill-atlas;plugin 脚手架、hook、agent 开发走
  plugin-dev 系列。
---

# skill-forge

消化自 yao-meta-skill@4eb11f9:方法收进本文,工具链 vendored 在
`scripts/`(stdlib-only)。上游 155 个脚本只有这几件有工程含金量,其余是
多平台发布治理——单人场景纯负重。上游自己的教义说"rigor 必须长得比
context 成本快,否则删",它自己就是反面教材;铸造时引以为戒。

```bash
PLUGIN=~/codebase/projects/agent-plugins
FORGE=$PLUGIN/skills/skill-forge/scripts
```

## 0. 资格门 — 最便宜的产出是"不建"

建:跨 session 第 3 次手做(debrief SKILL-CANDIDATES 毕业)、易被路由错、
可脚本化压缩。不建:一次性任务、解释/总结/翻译类、"以后可能用"。
Near-neighbor 律:先草拟一行 description,与现有 skill 分不清 → 并入该
skill,不新建。Boundary 律:候选必须能说出边界或代价("用于 X,不用于 Y")
——只有重复次数不够毕业(debrief 的毕业条件与这两条同源)。

## 1. 意图对话 — 只问改变设计的问题

job / 真实输入 / 必要输出 / 近邻排除 / 约束。按 grill-me 分层:多数自决,
只有方向性取舍升级给 CEO。

## 2. Trigger-first — description 先于正文

1. 写 frontmatter description:动作 + 边界 + 触发词 + 负例。
2. 建 `evals/`,抄 `skills/dispatch/evals/` 的形状(should / should-not /
   near-neighbor 三桶 + 3-5 个 description 锚定的概念桶)。
3. `python3 $FORGE/trigger_eval.py --description-file skills/<name>/SKILL.md
   --cases <c> --semantic-config <s>` → P = R = 1.0 才继续
   (直接喂 SKILL.md 即可,`>-` 折叠块解析已在 vendored 版修复)。
4. `python3 $FORGE/build_skill_atlas.py --workspace-root $PLUGIN/skills
   --output-dir /tmp/atlas` → 与全舰无 ≥0.42 重叠。

## 3. 正文与放置

正文 ≤700 tokens(`python3 $FORGE/context_sizer.py <dir> --json` 验证);
深度进 `references/`,确定性步骤进 `scripts/`,评测进 `evals/`。
本仓公开:示例里的内部标识(函数名/工单号/人名)一律虚构化,只留形状。

## 4. 收尾 — 首版即基线

- `skill-atlas/call-site.md` 补一行:接线点 = 准入证,填不出 → 别 ship。
- 从候选毕业的,回写 SKILL-CANDIDATES 该行 3 行 eval-delta:
  before-description → after-description → 修掉了什么路由混淆。
- 跑 `plugin-dev:skill-reviewer` 独立评审(自验抓不出语义缺陷)。
- bump plugin.json + marketplace.json,`bun sync-agent-skills.ts`。
- 恰好列 **3 个**下一迭代方向,防 scope 蔓延,也防"首版即终版"。

## Vendored 工具链

| 脚本 | 用途 | 消费者 |
|---|---|---|
| trigger_eval.py | description vs cases 的 P/R | 本 skill · skill-atlas |
| context_sizer.py | token 预算估算 | 本 skill · skill-atlas |
| build_skill_atlas.py (+2 兄弟模块) | 路由重叠矩阵 | skill-atlas |

上游不再跟踪;脚本坏了修 vendored 版(stdlib-only,零依赖)。
