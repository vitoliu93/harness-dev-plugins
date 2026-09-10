# 盲区扫描

盘问只能覆盖想得到的分支;扫描负责想不到的。产出简报,喂进决策树。

## 步骤

- 先用一句话框定已知事实、要扫的 repo/domain lens,并按用户已说明的经验校准范围。
- 主上下文只编排,原始 dump 不进来。一条消息并行 spawn:
  - **repo lens**:每模块一个 `Explore` agent,报 conventions / 隐藏耦合 / prior art /
    git 史雷区,cite file:line。
  - **domain lens**:每主题一个独立 agent 跑 exa-code,报非专家想不到的 pitfalls /
    spec 约束 / 质量天花板,交 digest + sources。只在任务真依赖仓外知识时才开。
- 合并成 **5-10 条**简报,只收用户 prompt 里没有的,按"猜错的代价"排序:
  改数据模型/架构的约束 > 改整个方案的 prior art > 违反即返工的惯例 > 小 gotcha。
- 格式:一行一条 `[repo|domain]` **你不知道的那件事** — 为什么它会改变计划。
