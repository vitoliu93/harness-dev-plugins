# 子代理 Prompt 模板

四路取证的 prompt 骨架。`<项目>` / `<路径>` / `<issue源>` 按目标替换。四个代理**一条消息并行发出**。

## 1. Issue 聚类（项目对应 issue 源 operator，bare 模型）

```
目标：为 <项目> 的 CTO 级审计收集 issue 证据。

查询与仓库 <项目> 相关的工作项：
1. 拉取 open + closed 的工作项，覆盖最近 4-6 个月（翻页拉够，至少 60-100 条）。
2. 每条记录：ident、标题、类型（缺陷/任务/需求）、状态、创建时间；缺陷类若详情/评论里有根因，抽一句话根因。
3. 不返回原始 JSON，返回聚类 digest：
   - 按模块/主题聚类，每类列 issue ident + 一句话描述
   - 统计：缺陷 vs 需求比例、哪些模块缺陷最密集、同一模块反复出 bug 的复发主题
   - 3-5 条「工程质量信号」（某类 bug 反复出现说明缺什么机制）
输出中文。
```

## 2. 代码结构勘察（dev-kit:code-search，bare 模型）

```
目标：为 CTO 级审计绘制 <路径> 的架构全貌。返回结构化中文 digest（引用 file:line，不贴大段代码）：

1. 入口与服务层：什么框架、暴露哪些 API、分层是否清晰
2. 目录结构地图：各目录职责 + 行数统计（wc -l），单文件 >800 行的「上帝文件」前 10 名
3. 核心业务逻辑住在哪：受打包/类型/测试管控的代码 vs 游离在外的代码，各多少行；共享代码机制（有没有 sys.path hack 之类）
4. 配置与环境：配置文件几套、读取是否统一、环境变量读取总数 vs 文档化数量
5. 外部依赖面：调了哪些外部服务、客户端封装在哪、有没有重复封装/散落直调
6. 测试与质量：tests/ 有什么、覆盖哪些核心路径、CI 有没有测试环节、lint 是否固化
7. 构建与部署：Dockerfile/发版脚本的分工与冗余
8. 坏味道清单 5-10 条最扎眼的，带 file:line：死代码、重复实现、双轨依赖、超长文件
9. 依赖方向抽查：core/domain 层有没有反向 import adapter/infra 层（列 import 证据）
```

## 3. Git 历史挖掘（general-purpose，**sonnet**）

```
目标：为 CTO 级审计分析 <路径> 的 git 历史。只用只读命令（git log/shortlog/rev-list/cat-file），返回中文 digest：

1. 基本盘：仓库年龄、总提交数、活跃作者占比（shortlog -sn）、身份碎片化（同人多 identity / 默认占位名）
2. 热点文件：近 4 个月改动次数 Top20；结合当前行数标出「又大又频繁改」的高危文件
3. 修复比例：fix/修复/bug/hotfix 提交占比；同一文件短期反复 fix 的打地鼠模式（列 3-5 例带 commit 摘要）
4. 提交习惯：关联 issue ident 比例、巨型提交（>30 文件或 >2000 行）占比、极简 message 数、revert 次数
5. 分支模型：分支列表、主线关系（发布分支是否严格是主线子集）、merge 方式、tag 命名体系
6. 危险信号：配置/密钥文件是否被跟踪、大二进制进历史（.git 体积 + 最大 blob 前 5）
7. 3-5 条工程流程信号（好坏都要）
数字必须来自命令输出，不臆造。
```

## 4. 盲画领域模型（general-purpose，**opus**）

```
目标：为 CTO 级审计提供领域基准蓝图。硬约束：**禁止读 src/ 等任何实现代码**，
只许读 <路径> 下的 README、docs/、产品描述、API 接口名/路由清单（如有）。

基于这些材料，盲写"这个系统的领域模型和模块边界理应长什么样"：
1. 核心领域实体清单：每个实体一句话定义 + 权威名字（你认为它应该叫什么）
2. 理想模块切分：按领域关节切出的模块边界，每个模块一句话职责
3. 模块间依赖方向：谁可以知道谁，哪些方向不该存在
4. 3-5 条关键领域不变量（金额非负、状态机合法迁移之类）
输出中文。不许猜实现，只从领域推演。你的产出会与真实代码结构 diff，偏差本身就是审计发现。
```

## Phase 1.5 主上下文验证命令（示例）

```bash
# CI 有没有测试
grep -rn 'pytest\|test' <CI配置目录>/* | head

# 环境变量契约面：读取数 vs 文档化数
grep -rho 'environ\.get("\([A-Z_]*\)"\|getenv("\([A-Z_]*\)"' <src> --include='*.py' | grep -o '"[A-Z_]*"' | sort -u | wc -l
grep -c '^[A-Z_]*=' env.example

# 可疑死代码：零引用验证
grep -rln '<可疑模块名>' <src> --include='*.py'

# 临时兼容考古：扫化石候选，逐条 git blame 问出生理由
rg -n 'TODO|FIXME|HACK|XXX|workaround|临时|兼容|fallback|deprecated' <src> | head -40
git log -1 --format='%ad %s' -- <命中文件>   # 出生时间与理由

# 概念一致性抽查：核心名词的别名拼写
rg -io 'userId|user_id|uid' <src> | sort | uniq -c   # 按项目核心名词替换

# 宪法断言验证（上次审计遗产还活着吗）
ls <项目>/docs/audit/constitution/ && bash <项目>/docs/audit/constitution/*.sh

# 共享代码 hack 计数
grep -rl 'sys.path' <目录> --include='*.py' | wc -l
```

## 宪法断言格式（Phase 2.5 落地用）

每条一个可执行文件，落 `<项目>/docs/audit/constitution/`，头部注释即出生证明：

```bash
#!/usr/bin/env bash
# rule: domain 层不得 import infra 层
# source: domain 直查 DB 绕开 repository 的复发缺陷
# retire-when: 分层重构完成且连续两次审计零违例
! rg -l 'from infra' src/domain/ || { echo '违宪: domain→infra'; exit 1; }
```

## Phase 4 算法层追加（复用 dev-kit:code-search 或主上下文精读）

优先找项目自带的算法清单文档（如 `docs/*algorithm*inventory*.md`）。逐域核对：

- 检索/召回：合并策略是否跨源比分数（→ RRF）、阈值是否硬编码（→ 分位数）、有无离线评测
- 对齐/时间戳：有没有可省的重复计算（TTS 直出时间戳、剪切算术重映射）
- LLM task：有无 schema 硬校验、prompt 有无版本与回归、可否内容哈希缓存
- 管线：有无断点续跑、耗时数据是否驱动优化
- 数据层：ID 是否确定性派生、降级是否显式打标、产物有无 QA 门禁

常用武器库：golden set + recall@k / RRF 排名融合 / MMR 多样性 / schema 硬校验+有界重试 / prompt 版本化+LLM-as-judge 回归 / 内容哈希缓存 / stage 断点续跑 / 确定性 ID / fail-loud 降级协议 / 成片(产物) QA 门禁
