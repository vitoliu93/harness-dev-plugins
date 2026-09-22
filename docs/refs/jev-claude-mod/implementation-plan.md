# Jev 技能推荐改造实施文档

## 一、开发参考索引

在动手改代码前，先对照查阅以下本地参考文档中的对应章节：

| 文档路径 | 重点查阅章节 | 用途 |
|---|---|---|
| `docs/refs/jev-claude-mod/01-claude-mod-intro.md` | §1. 事件无处不在；§2. 事件洋葱模型 | 掌握 `prompt.submit` 拦截点与上下文注入原理 |
| `docs/refs/jev-claude-mod/02-mod-development-cookbook.md` | §1. 骨架；§2. 挂事件与类型安全；§5. 测试 | 掌握 Mod 开发结构、`$` 引擎接口与单测编写 |
| `docs/refs/jev-claude-mod/03-fast-jev-compaction-case-study.md` | §4. 与 Jev 对话；§5. 骨架落地 | 学习 Jev 接口调用、32k/40KB 边界限制与数据脱敏 |
| `docs/refs/jev-claude-mod/official-mods.md` | §Testing；§Composing mods | 学习官方测试与 Mod 生命周期规范 |
| `mods/jev/types/claude-code.d.ts` | `CoreEngineInterface['session']`；`EventOf['prompt.submit']` | 查看当前版本 Claude Code 的类型声明与可用接口 |

---

## 二、需求与核心规格

### 1. 历史对话收集（倒序装入）
- **范围**：只收 `user` 和 `assistant` 的纯文字消息，跳过工具调用过程、报错和附件。
- **装配方式**：从最新一条消息开始，由后向前倒序装入历史对话。
- **容量上限**：文本总长度卡死在 25,000 字符以内，为技能列表和题目留出安全空间，确保单次请求体绝对不超过 40KB。
- **脱敏处理**：沿用已有 `redact` 函数，抹掉一切 API Key、密码、Token 和本地文件物理路径。

### 2. 全量技能元信息提取（只读 Meta）
- **扫描路径**：
  - `~/.claude/skills/*/SKILL.md`
  - `~/.agents/skills/*/SKILL.md`
  - 各已安装插件目录下的 `skills/*/SKILL.md`
  - 当前工作区的 `skills/*/SKILL.md`
- **提取字段**：
  - 仅解析头部 YAML Frontmatter 区域的 `name` 与 `description`。
  - **严禁** 改写、润色、缩写或重新总结 `description`。
  - **严禁** 触碰和读取 `SKILL BODY`（正文部分）。
- **去重与过滤**：同名技能以当前工作区优先，其次以用户目录优先；单个技能说明截取前 200 字符以防极端异常长文本。

### 3. Jev 评估出题重构
- **废弃逻辑**：
  - 彻底删除针对 `Agent` 的候选读取（不再读取 `agents.json`、`quota.json`）。
  - 彻底删除 `self` / `delegate` / `unknown` 的分工单选题。
- **新增出题**：
  - 将所有提取到的技能列表作为背景状态 `available_skills`。
  - 为每个技能生成独立的打分题目（TypeSafe `noul` 形式）：
    ```json
    {
      "type": "noul",
      "instructions": "Is skill <name> suitable or needed for the current user task in its recent context? Match by intent and keywords from description. Otherwise false."
    }
    ```

### 4. 判定与推荐输出（不卡数量）
- **数量限制**：不设数量硬上限，推荐结果完全由 Jev 打分决定。
- **合格门槛**：技能匹配分 `p >= 0.75` 视为合格，全数入选；若均低于 0.75，则推荐列表为空。
- **注入提示词**：格式收口为统一的 `<jev-skills>` 标记块，附带警示语（仅供参考，不强制执行）：
  ```markdown
  <jev-skills>
  Advisory only. The user task may benefit from invoking these skills:
  ["advanced-plan", "ccobs"]
  </jev-skills>
  ```
- **历史参考保留**：保留现有的高质量历史会话提取（Precedents 召回）作为补充辅助。

---

## 三、代码改造点清单

### 1. `mods/jev/hooks/core.ts`
- 定义 `SkillMeta` 类型：`{ id: string; name: string; description: string; path: string }`。
- 修改 `Snapshot`：将 `agents: Agent[]` 替换为 `skills: SkillMeta[]`。
- 重构 `recentFrom`：从后向前倒序装配 `user` 与 `assistant` 消息，控制总字符量。
- 新增 `skillsFrom(rawSkills: unknown[])`：验证并去重解析出的技能元信息。
- 重构 `makeRequest`：组装带 `available_skills` 的 Jev 请求体，出具技能相关的 `noul` 题目；硬性校验 `body.length <= 40_000`。
- 重构 `decide`：从返回概率中挑出所有 `p >= 0.75` 的技能，排序后全部保留。
- 重构 `render`：组装 `<jev-skills>` 输出内容。

### 2. `mods/jev/hooks/register.ts`
- 移除 `$.agent.list()` 与 `agents.json` 的依赖。
- 引入扫描或读取本机所有技能 `SKILL.md` 头部 Frontmatter 的轻量方法（结合缓存机制，避免每轮敲击键盘都重新扫盘）。
- 接收 `decide` 算出的推荐技能列表，注入到 `prompt.submit` 的上下文链条。

### 3. `mods/jev/tests/`
- `core.test.ts`：
  - 测试倒序消息贪婪截断逻辑（不超过上限）。
  - 测试从 `SKILL.md` 正确提取 `name` 和原版 `description`，排除正文。
  - 测试 0 个、1 个、多个技能达到阈值时的输出。
  - 测试超限保护（超过 40KB 抛出防护错误）。
- `register.test.ts`：更新 mock 数据，模拟真实 Jev 返回。

---

## 四、防护线与验证流程

1. **容量防护线**：
   - 请求体总大小超过 40KB 时立刻拦截，不发请求，降级为不推荐，保障会话不报错、不卡死。
2. **耗时防护线**：
   - 保持 3000ms 超时熔断；超时自动放行用户输入。
3. **提交前验证流程**：
   ```bash
   bun test
   bunx tsc -p mods/jev/tsconfig.json
   claude plugin validate --strict mods/jev
   ```
4. **独立复核**：
   - 完成修改后，使用 `orchestrate` 指派独立 reviewer 进行评审，确认 PASS 后方可提交。
