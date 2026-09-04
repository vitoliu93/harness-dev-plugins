---
name: visual-evidence
description: >-
  用 DOM 事实取证判定界面与分层画布上的行为改动，输出 PASS/FAIL 证据包。
  Use when 界面验收、判定选中态或装饰是否符合预期、或要把界面验收沉淀成可重跑探针。
argument-hint: "[待验收的 UI 行为清单]"
metadata:
  kind: sop
---

# visual-evidence

管**怎么取证、怎么判定**。怎么开浏览器、怎么点选元素 → `opencli-browser`（opencli 随包分发的外部 skill，不在本仓）。
账号、环境、URL、探针存放位置 → 项目侧 skill。
不适用于文档声明核验、后端接口断言、派发编排（→ orchestrate）。

证据阶梯与画布反例：[evidence-ladder.md](references/evidence-ladder.md)。
探针与派发契约：[probe-contract.md](references/probe-contract.md)。

## Hard gates

- **证据阶梯**：DOM 事实（元素几何、计算样式、属性断言）> 截图像素判读 > 坐标点击。判定只认最高一层拿到的证据。
- **分层画布禁坐标点击选目标**：画布坐标命中的是最顶层覆盖物，不是目标元素。必须走应用语义面（列表行 / 时间线条目 / 树节点 / 图层面板）完成选中，再取 DOM 证据。像素扫描会被描边、边框干扰误判。
- **正向冒烟**：验收输入必须实际触发目标行为分支。「没报错」「页面正常」不算 PASS，每项要有正向证据。
- **缺席可能是设计**：某个装饰（选中框 / 角标 / 手柄）不出现时，先读应用的渲染抑制逻辑再判 FAIL。满幅元素合法地不渲染装饰是常见设计。
- **只验 diff 触及的行为**：不做全量回归。每项一个 deep-link、一次取证，不重复探索。
- **整轮复用同一 browser session**：登录一次。
- **只读**：验证过程不改被测应用数据，只操作测试夹具。

## 执行骨架

1. 从 diff 列出待验行为项，逐项写下「触发输入 → 期望的 DOM 可观测量」。
2. 起一个 session，登录一次，之后每项直接 deep-link 进入。
3. 按证据阶梯取证：拿元素几何、计算样式、属性；画布类目标先经语义面选中。
4. 判定：证据支持 → PASS；证据反证且已排除抑制策略 → FAIL；取不到证据 → BLOCKED + 原因。
5. 首轮通过的项沉淀探针（命令序列或断言脚本），输出 JSON verdict。
6. 回报证据包：每项一行结论 + 一条决定性证据 + 复现步骤。

## 证据包契约

- 每项：`PASS | FAIL | BLOCKED` + **一条**带具体数字的决定性证据（DOM 数值或结构断言）+ 复现步骤。
- verbose 状态快照、截图、DOM dump 全留子上下文，不回传。
- 截图仅 FAIL 时留证。

## 探针沉淀

首轮人肉验证通过的项，产出可重跑探针：一段浏览器命令序列或断言脚本，输出 JSON verdict
（`PASS/FAIL` + 数值证据）。复验轮直接跑探针，不再重新探索浏览器。
探针存放约定由调用方项目定；本 skill 只定输出契约，见 [probe-contract.md](references/probe-contract.md)。
