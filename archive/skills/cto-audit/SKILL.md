---
name: cto-audit
description: CTO 视角的项目级技术审计：三路并行取证（issue 聚类 / 代码结构勘察 / git 历史挖掘）+ 主上下文独立判断 + 证据化综合报告（质量经济学总判断 → 结构缺陷排序 → P0/P1/P2 行动路线图），可选算法层二阶段与 HTML/飞书云盘交付。当用户说「审计这个项目」「CTO 审计」「项目体检」「站在 CTO 角度看看哪里有缺陷/可以优化」「tech audit」「cto-audit」时使用。不用于：单个 diff 的代码评审（走 code-review）、单 bug 排查、纯安全审计（本 skill 刻意弱化安全比重）、过度工程专项扫描（走 ponytail-audit）。
---

# CTO 项目技术审计

对一个仓库/子项目做 CTO 级技术审计，产出证据化的结构性判断和可排期的行动路线图。

## 权重铁律（先读）

**能力 > 性能 > 架构 > robustness ≫ 安全。** 团队处于快速迭代期、产品未推广 public：

- 安全项（密钥入库、镜像烤 env 等）只在确属重大敞口时**一笔带过列入 P0**，一条以内，不展开、不说教
- 安全话题严禁主导报告篇幅；报告的主体永远是能力缺口、性能瓶颈、架构缺陷、复发性 bug 的根治
- 此权重是**阶段函数**：当项目推广 public / 进入商业化交付时，由用户显式上调安全权重，skill 默认不变

## 流程

### Phase 0 — 定界（主上下文，几分钟）

1. 确认目标项目目录；读它的 CLAUDE.md / AGENTS.md / README / pyproject（或同类清单文件）
2. 找现成清单文档（算法清单、架构文档、白皮书）——存在就是巨大捷径，优先精读
3. 检索 auto-memory 里该项目的历史 issue 根因记录，作为交叉验证素材

### Phase 1 — 三路并行取证（子代理，一次性全部发出）

三个子代理并行跑，prompt 模板见 [references/subagent-prompts.md](references/subagent-prompts.md)：

| 路 | 代理 | 模型 | 产出 |
|---|---|---|---|
| Issue 聚类 | gitee-operator（或项目对应 issue 源） | bare | 缺陷占比、模块缺陷密度、复发主题、工程质量信号 |
| 代码结构勘察 | code-search | bare | 分层地图、LOC 分布、上帝文件、死代码、测试/CI 实况、坏味道清单 |
| Git 历史挖掘 | general-purpose | **sonnet** | churn 热点×体积、fix 比例、打地鼠文件、提交习惯、分支模型 |

**子代理取证，主上下文判断**——发出后不等待，立即做 Phase 1.5。

### Phase 1.5 — 主上下文独立精读（与 Phase 1 并行）

亲自读承重文件、亲自跑验证命令（示例见 subagent-prompts.md 末节）：

- 服务层入口与分层（谁启动、路由→服务→核心的链路）
- CI 配置里有没有测试环节（grep pytest/test，眼见为实）
- 配置面统计（环境变量读取数 vs 文档化数）
- 可疑死代码的引用验证（grep import，零引用才敢下结论）
- 依赖清单里的双轨/残留（两套框架、两个同类 SDK）

**规则：报告里每一个"惊人论断"必须有一条自己跑出来的证据，不能全靠子代理转述。**

### Phase 2 — 交叉验证与综合

- 每个论断配数字或 file:line；issue 根因 ↔ 代码证据 ↔ 历史模式三方互证
- 找"质量经济学"总判断：缺陷占工作项比例 × fix 提交比例 → 返工消耗产能几成 → 结构性根因一句话

### Phase 3 — 报告（对话内交付）

按 [references/report-template.md](references/report-template.md) 八段骨架写。硬要求：

- 开头一句话总判断（质量经济学），不铺垫
- 结构性缺陷 3~5 个，每个都是「问题 → 证据 → 动作」三段
- **必须有「值得肯定」区块**——审计要公允，好实践点名保持并推广
- 收尾 P0（本周）/ P1（本月）/ P2（本季）行动表，带成本×收益两列

### Phase 4 — 算法层二阶段（可选，用户追问"算法/技术实现上还有什么建议"时）

1. 先找项目自己的算法清单文档；没有则让 code-search 盘点算法承重脚本
2. 核心猎物是**「有算法、没闭环」**：任何一个召回/对齐/布局/LLM task，只要没有离线评测和回归机制，质量就只能靠生产 issue 度量——这是最高优先建议的固定来源
3. 每条建议必须锚定一次真实事故或一笔可量化成本（省一轮 ASR、重跑 12min→2min），不给教科书泛论
4. 常用武器库：golden set + recall@k / RRF 排名融合 / MMR 多样性 / schema 硬校验+有界重试 / prompt 版本化+LLM-as-judge 回归 / 内容哈希缓存 / stage 断点续跑 / 确定性 ID / fail-loud 降级协议 / 成片(产物) QA 门禁

### Phase 5 — 交付物（可选，用户点名才做）

- **HTML 可视化**：写内容源稿（全部数字忠实照搬）→ 委派 general-skills-executor（**opus**）跑 html-doc
- **发飞书**：委派 general-skills-executor（**haiku**）——**上传云盘 + 组织内链接可读 + 群发链接**，不要走文件消息（用户身份常缺 im:resource:upload，且链接体验更好）
- **advanced-plan 记档**：goal/spec/todo/exploration 四件套落 `<项目>/docs/advanced-plans/YYYY-MM-DD-<slug>/`，record-only（不开 worktree、不执行），todo 按 P0/P1/P2 拆可认领 phase

## 边界

- 不做单 diff 评审（code-review 的事）、不做单 bug 排查、不做渗透/合规类安全审计
- 过度工程专项扫描 → 转 ponytail-audit；用户同时要两者时，cto-audit 引用其榜单作为结构勘察的补充证据，不重复实现该镜头
- record-only 原则：审计会话本身不改业务代码；整改由后续会话按 advanced-plan 认领
- 子代理返回的结论未经主上下文抽验，不得进报告
