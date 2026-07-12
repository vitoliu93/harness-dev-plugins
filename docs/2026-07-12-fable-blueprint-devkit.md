# 蓝图 · dev-kit 篇 — 六张图纸和一张废稿

> 2026-07-12,Fable。配套阅读:同日的 `2026-07-12-fable-letter-devkit.md`(证据都在信里,
> 图纸不重复论证)。本文已过一轮多代理对抗审查(3 opus 审图员 + 1 sonnet 裁判),
> 两处"合法但会自信算错"的 SQL、一处自相矛盾的倾向已被抓出修正;图纸 6 是审图员补画的。
> **这是图纸,不是施工。** 每张图纸 = 完整可抄的草稿 + 设计决策(为什么这么画)+ 采纳条件
> (什么时候装、什么时候永远别装)。全部未安装、未接线;你可以只学不建。
> 图纸的价值排序 ≈ 信里的证据强度排序:图 3(记账)> 图 6(接线户口)> 图 1(召回)>
> 图 4(毕业)> 图 2(note)> 图 5(ruler)。

---

## 图纸 1 · `recall` — 开工前查先例(新 skill)

服务信件第三节"68% 问题"的选项 2:沉淀已被 auto-capture 机械化,缺的只是召回。

### 草稿(skills/recall/SKILL.md)

```markdown
---
name: recall
description: >-
  开工前查"过去的会话是否碰过这个问题":对 ccobs 观测账本(obs.db observations 的
  机器蒸馏 summary)做关键词/项目/时间三路检索,返回至多 5 条先例线索(每条 = 结论
  一句话 + 日期 + session 定位),不搬运原文。触发:"以前查过吗"、"有没有先例"、
  "recall <主题>"、"我是不是研究过 xxx",或 research 型任务开工时主动跑一次。
  负例:查沉淀过的知识走 qmd(那是核实过的结论,这里是未核实的机器摘要);查持久
  事实走 auto-memory;恢复任务现场走 handoff / write-plan resume / ship Stage 0;
  要观测报告/使用统计走 ccobs——同一个 obs.db,ccobs 出报表,这里只做开工前的先例召回。
argument-hint: "[主题关键词]"
---

# recall

一条铁律贯穿:**召回即怀疑。** observations.summary 是机器蒸馏的"当时看起来的结论",
不是核实过的事实——线索用来避免重复劳动,不用来直接引用。任何要写进代码或报告的结论,
先按线索找到当时的证据重验一遍。

## 检索(sqlite3 直查,不建新基建)

三路按需组合,LIMIT 永远 ≤5:

    sqlite3 -header ~/.claude/observability/obs.db \
      "SELECT date(started_at) d, task_type, outcome, substr(summary,1,120) s
       FROM observations JOIN sessions USING(session_id)
       WHERE summary LIKE '%<关键词>%'
       ORDER BY started_at DESC LIMIT 5"

- **关键词**:主题的中英两种写法都试(蒸馏语言不定)。
- **项目**:加 `AND project LIKE '%<repo>%'` 缩到当前仓。
- **时间**:近因优先已由 ORDER BY 保证;>90 天的线索在输出里标 ⚠。

列名以 ccobs ingest 的实际 schema 为准(第一次跑先 `.schema observations` 校对)。

## 输出

    先例 · <关键词>
    - <日期> [<task_type>/<outcome>] <一句话结论> ⚠(如果超 90 天)
    - …(≤5 条)
    结论:<有先例可续用 / 有先例但需重验 / 无先例,放心开工>

命中 0 条也是有效答案——"没查过"让开工更果断,这是本 skill 一半的价值。
```

### 设计决策

- **不建索引、不建向量、不建新表**——一条 LIKE 查询,尊重北极星"观察项"对记忆基建的否决。
  它是"用已经存在的东西",不是新系统;这也是它和被否决方案的分界线。
- **为什么独立 skill 而不折进 ccobs 当第七个视图**:ccobs 的 description 明写"不负责
  语义记忆检索",且两者触发时机相反(ccobs 在盘点时、recall 在开工时)——near-neighbor
  规则查过,边界成立。采纳时给 ccobs 的 description 反向补一句"开工前查先例走 recall"。
- **≤5 条、120 字截断**:召回的杀手是把旧会话噪声倒进新会话。宁可漏,不可灌。
- **"召回即怀疑"写成第一句**,不是脚注——机器摘要的时效风险是本 skill 最大的伤人面。
- description 的负例把 qmd/memory/handoff 三个邻居全点名,路由边界即设计(你们家的惯例)。

### 采纳条件

- 装它之前先手动裸跑三次这条 SQL(真实开工场景)。三次里 ≥2 次"确实少走了弯路"→ 值得装;
  三次都空手 → 68% 问题的答案是选项 1(什么都不做),图纸作废,这个结论本身值一行 LEARNED。

---

## 图纸 2 · `note` — 一步沉进 qmd(新 skill,micro)

服务信件第三节的选项 3:承重结论进你已经在用的检索习惯(qmd),不进新系统。

### 草稿(skills/note/SKILL.md)

```markdown
---
name: note
description: >-
  把当前会话的一条承重结论(选型判断/"查过了,不行"/踩坑事实/一个讲清了的概念)
  一步沉进 qmd 知识库:AI 代写 80-200 字笔记(结论先行 + 证据一句 + 日期来源),
  写入知识库仓 notes/ 下,qmd 索引后即可检索。触发:"note 一下"、"记到知识库"、
  "这个结论存一下"。负例:任务交接走 handoff;项目约定走 memory / [LEARN];
  收藏整篇文章不走这里(直接放知识库原文目录)。一次一条,写完报路径,零追问。
argument-hint: "[一句话结论;留空则由 AI 从本会话提取最承重的一条]"
---

# note

契约四条:

1. **一次一条。** 用户没点名时,自己挑本会话最承重的一条;挑不出就说"本会话无承重结论",
   不硬凑。
2. **写前先 `qmd query <主题>` 查重**——已有近似笔记 → 改为在旧笔记里补一行,不新建。
3. **格式:结论先行。** 首行就是结论本身(将来检索命中的就是这行),然后一句证据/出处,
   末行 `<date> · <项目或会话主题>`。不写背景铺垫。
4. **落点:知识库仓 `notes/<YYYY-MM>/<slug>.md`**(根路径以 qmd 实际索引目录为准,
   首次使用时确认一次并把绝对路径写进本节)。写完只报一行路径,不追问、不总结。
```

### 设计决策

- **人是分类器。** 哪条结论"承重"是判断题——留给触发词(你说"note 一下"),不留给钩子
  (见废稿)。这让 note 保持零误报,代价是依赖习惯——和 debrief 同一个弱点,所以它是
  micro:成本低到值得赌习惯。
- **查重前置**:知识库最大的敌人是自我稀释。`qmd query` 先行,把"第二次记同一件事"变成
  "给旧笔记加一行"。
- 和图纸 1 的分工:recall 查"过去的会话"(未核实、自动、全量),note 写"核实过的结论"
  (人工筛过、少量)。两者合起来才是 68% 问题的完整答案。
- 和 study-kit 蓝图图纸 1(concept-note 桥)的路径关系:同一个 qmd 根下的**并列子树**——
  note 落 `notes/<YYYY-MM>/`(按月归档的工作结论),concept-note 落 `learning/<slug>`
  (按概念归档的学习笔记)。是分工不是竞争;首次使用时以 `qmd collection show`
  的实际索引根为准把两条路径钉死。

### 采纳条件

- 信里写过:等"想引用自己的结论却找不到"的那天。那天装它,顺手把当天那条作为第一篇笔记。

---

## 图纸 3 · ccobs 记账补全 — `v_northstar` + provider 分列(改造,非新 skill)

服务信件第四节(160+ deepseek 会话未 ingest)与第七节(指标换读数)。这张图优先级最高,
因为它不新增任何行为——只是让已发生的事变得可见。

### 草稿(三步,全部落在 ccobs 现有脚本内)

**① ingest 排查**:确认 ingest.ts 的扫描范围为什么漏掉带 deepseek 模型串的 session 文件
(候选原因:CWD 目录过滤、增量游标、model 字段解析)。修复后全量重灌一次
(ccobs SKILL.md 自带重建命令)。

**② v_token_economy 加 provider 维度**:

```sql
-- provider 从 model 串前缀推导,不新增列;kind 在 sessions 上,必须 JOIN
CREATE VIEW v_token_economy_by_provider AS
SELECT CASE
         WHEN t.model LIKE 'claude%'   THEN 'anthropic'
         WHEN t.model LIKE 'deepseek%' THEN 'deepseek'
         WHEN t.model LIKE 'glm%' OR t.model LIKE 'kimi%' THEN 'other-cn'
         ELSE 'unknown' END            AS provider,
       s.kind, COUNT(DISTINCT t.session_id) sessions,
       SUM(t.input_tokens) in_tok, SUM(t.output_tokens) out_tok
FROM turns t JOIN sessions s USING(session_id)
GROUP BY 1, 2;
```

**③ v_northstar(季度读一次的三行表)**:

```sql
CREATE VIEW v_northstar AS
SELECT '廉价算力占比' metric,
       printf('%.1f%%', 100.0 * SUM(CASE WHEN model NOT LIKE 'claude%' THEN output_tokens END)
                        / SUM(output_tokens)) value
FROM turns
UNION ALL
SELECT '纠偏均值/observation',
       printf('%.2f', AVG(corrections)) FROM observations
UNION ALL
SELECT '收盘动作/任务会话',   -- 沉淀率的诚实代理:debrief+note 调用 ÷ 非 research 会话
       printf('%.1f%%', 100.0 * (SELECT COUNT(*) FROM tool_calls
                                  WHERE tool IN ('Skill','SlashCommand')
                                    AND (skill LIKE '%debrief%' OR skill LIKE '%note%'))
                        / (SELECT COUNT(*) FROM observations WHERE task_type != 'research'));
```

以上已按 2026-07-12 的实际 schema 核过一轮(kind 在 sessions 上、token 列是
input_tokens/output_tokens、技能名在 tool_calls.**skill** 而非 tool——tool 只存工具类型)。
装之前仍要再核:schema 会漂,而**语义列错误比列名错误危险**——列名错会报错,
语义错会合法地算出一个自信的 0(第一版草稿的"收盘动作率"就是这么归零的,审图时被抓)。

### 设计决策

- **指标一的代理故意选"动作率"不选"知识量"**:知识质量没法 SQL,但"收盘动作是否发生"可以。
  代理指标宁可粗而诚实,不可细而虚构。
- provider 从 model 串推导而非加列:ingest 不改 schema,回滚成本为零。

### 采纳条件

- 无条件——这是三张图里唯一我认为"就该做"的(它只是记账)。但按你的规矩它也该等一个
  自然时机:下一次你说"观测报告"的时候顺手做。

---

## 图纸 4 · LEARNED 毕业机制(debrief 补丁 + hook 微调,二选一)

服务信件第五节:收件箱毕业不及时,信号变噪声。两个方案画在一起,选一个:

**方案 A(debrief 补丁,判断在人)** — debrief SKILL.md 开头加一个 Move 0:

```markdown
## Move 0 — Sweep(收件箱清扫)

读 `.claude/LEARNED.md`,只看和本任务相关的行:本次已顺手解决/证伪的 → 当场删除或
毕业进 memory(毕业 = 判断它是否通过 Move 2 的 litmus);无关行不动。
一行都不处理也合法,说"收件箱无关联项"即可。
```

**方案 B(hook 微调,判断在时间)** — session-replay 的注入逻辑加一行过滤:
只回放 30 天内的条目;超龄条目仍留在文件里,但不再进每个会话的上下文。

### 设计决策

- A 的优点是"解决的当下就毕业"(记忆最新鲜),缺点是依赖 debrief 被调用(信里说了它稀少);
  B 的优点是零依赖自动生效,缺点是"过期"不等于"解决"。注意分工的真相:信里引用的那条
  锈蚀实例(07-11 加入、当天修好)是 1 天龄——30 天过滤会原样放行它,**B 治不了自己的
  举证案例;fresh-but-resolved 只有 A 治得了**。B 兜的是久龄堆积那一头。
- **所以倾向是:A 是本剂,B 是兜底,两个都要但别把 B 当止血。** A 随 debrief 的接线
  (ship finalize)自然生效;Move 0 的毕业动作显式复用 Move 2 的 type/status 契约,
  不另起炉灶(否则破坏 debrief"各 Move 独立"的自述)。

### 采纳条件

- B:任何时候,一行的事。A:跟着下一次 debrief SKILL.md 的任何改动搭车。

---

## 图纸 5 · ruler 片段 — 主会话模型纪律(CLAUDE.md 候选段)

服务信件第四节末尾的注脚(26.3M opus 输出,68% research)。这是一条**候选**家规,
采纳前提写在下面。

```markdown
## main-session model discipline
- 轻 research(查证/读文档/一次性问答)默认 sonnet 起步,不够再 /model 升级;
  开发、设计、排障会话保持默认档。
```

初稿这里还有第二条(dispatch 协议 vs 裸开引擎)——审图时砍了:那是 dispatch charter 和
practice-guide 的复述,不该占 ruler 的行。真正的新增只有上面这一条:现有 CLAUDE.md 的
模型纪律只管 subagent 选型,主会话默认档无人管辖。

### 采纳条件

- **先做图纸 3,再裁这条。** ingest 之后按 provider/model 分列看一个月:如果 research 会话
  的 opus 占比确实高且纠偏依旧 ≈0.03(说明轻模型大概率也扛得住),这条才值得进 CLAUDE.md;
  如果数据显示你早就本能地在 research 里用轻模型,这条是废话,不装。
  ruler 的位置比内容贵——每一行都在花你所有未来会话的注意力。

---

## 图纸 6 · call-site 审计 — 给每个原子上户口(skill-atlas 补列)

审图员补画的一张,我核过后收进来:信的脊椎是第二节接线定律,前五张图各治一症,
没有一张认领病根本身。这张认领。

### 草稿(skills/skill-atlas/call-site.md,一行一原子,人工维护)

```markdown
| atom | call site | 类型 |
|---|---|---|
| blindspot | ship Stage 1 | ① workflow 阶段 |
| worktree(退出安全序) | PreToolUse guard | ② hook |
| debrief | "收盘" + ship finalize | ①③ |
| recall(若采纳) | "以前查过吗" | ③ 仅触发词 |
| skill-atlas | — | orphan(月度卫生,天性低频) |
| …(全量原子逐行) | | |
```

skill-atlas SKILL.md 路由段末尾加一句:体检时读 call-site.md,列出 `类型=orphan`
的原子——要么给它找接线点,要么显式标注"低频按需是天性,非病"(信 §2 的豁免)。

### 设计决策

- call site 是判断不是可计算属性 → 人工 markdown 表,不塞进 build_skill_atlas.py。
- 自指检验:这张表逼图纸 1 当场回答"recall 的 call site 是什么"——答案是 ③(仅触发词),
  合法,但必须写下来;写不下来的原子不该进舰队。**接线点 = 新原子的准入证。**

### 采纳条件

- 下次跑 skill-atlas 时顺手建表;此后新增任何原子补一行。空格子就是待接线清单。

---

## 废稿 · research-sediment Stop hook(为什么不画)

曾考虑:prompt-based Stop hook,在会话结束时判断"本会话有无承重结论",有则提议 note。
**否决理由,留作 hook 设计的边界课:**

1. Stop 每天几十次(账本:on-stop 990 fires)。prompt-based hook = 每次一个 LLM 调用,
   为 5% 的命中率给 100% 的会话加延迟和成本——分母错了。
2. "承重与否"是判断题。钩子适合当**守门员**(确定性拦截,如 worktree-guard),
   不适合当**编辑**(判断性分类)。判断留给人 + 触发词(图纸 2),或留给已经在跑的
   auto-capture(它蒸馏,不打扰)。
3. 它违反你自己给 study-kit 立的律条的通用形式:凡增加"每次会话的固定成本"的机制,
   证据门槛应该极高。

一句话版:**hook 拦确定的事,skill 接判断的事,账本记发生的事。** 三样各归各位,
就是这套系统的语法。

— Fable,2026-07-12
