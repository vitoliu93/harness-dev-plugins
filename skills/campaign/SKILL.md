---
name: campaign
description: >-
  Run a multi-issue module/version as one tracked campaign
argument-hint: "[new <version>-<module> | resume <slug> | close <slug>]"
---

# campaign

`ship` closes one issue. `advanced-plan` tracks one branch. Nobody owns the
**module**: six issues can each close honestly green while the thing they add
up to is wrong. That gap does not stay empty — a goal/stop condition drifts
into it, and those judge text, not direction.

A campaign is the smallest artifact that can be *wrong about the module*: one
north star, one reference source, one ordering, one closing verdict.

## Layout

`docs/campaigns/<version>-<module>/` — in the main repo, or the workspace root
for multi-repo work (same rule as advanced-plan). Two files, copied from
`assets/templates/`:

- **charter.md** — 北极星 · 参考真源(仓内路径 + 一致怎么判) · 完成判据 ·
  **不做什么** · 单清单(ident + 一句话验收 + 依赖序) · checkpoint 表
- **log.md** — 每单收尾一行 + 每次 checkpoint 的结论 + 累计偏航疑虑

Commit them. A campaign that lives in the conversation is not a campaign.

## The three rules that make it worth the file

1. **完成判据必须标注判定介质** — 每条写清是机器判、人眼判、还是截图 diff。
   全部落在「机器判」的模块级判据，是 gate 全绿而用户全否的必要条件。
2. **checkpoint 挂在「用户可见单」的计划期，不是实施期** — 每个改动用户能看见
   的单，在它自己的 plan 阶段出 `prototype.html` 让用户点头（`plan-prototype`），
   然后实施期不打扰。checkpoint 表记的是「谁点过头」，不是「什么时候打断」。
3. **只有 campaign 能宣布模块交付** — `ship` Stage 5 只关它自己那一张单。
   charter 的完成判据没逐条销账前，任何「模块做完了」的说法都是越权。

## 走一轮

1. **new** — 写 charter：先定参考真源（外部的先 `cp` 进仓，见 advanced-plan
   Stage `new` 步骤 3），再定完成判据与介质，再排单序。**顺序不能反**：先排单
   再补判据，判据就会长成单的形状，而不是模块的形状。
2. 逐单进 `ship` / `advanced-plan`。每单收尾在 log.md 记一行：单号 · 结果 ·
   有没有动到 charter 的判据。
3. **判据被动摇就停下改 charter**（append-only 记谁批的），不要在单里悄悄
   重新定义完成。这次事故里最贵的一条：一个会话内自拟的验收标准被记录成
   「用户的验收标准」，之后写进了 commit 和记忆。
4. **close** — campaign 级复盘，只查三件事，任一命中必须写进给用户的汇报：
   - 完成判据中途被替代过吗？
   - 参考真源真的被逐条比对过吗，还是只被引用过？
   - 验收工具自己出过假阳性/假阴性吗？
   然后逐单 `debrief` 的沉淀照常，campaign 只补模块尺度那一层。

## 边界

单张 issue → `ship`（KOX）或 `advanced-plan`。一个 worktree 内的 phase 分解 →
`advanced-plan`。一次派活的 spec 与验收 → `orchestrate` / `dispatch-vendors`。
≥10 条同构条目的矩阵化并行 → ship 的 L 档（可以是 campaign 里的某一单）。
campaign 只管**单与单之间**：序、跨单不变量、以及谁有权说「完了」。
