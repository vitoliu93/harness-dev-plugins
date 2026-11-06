# Docs 模式：开发文档体检

文档随代码无声 drift：位置散、内容旧、版本重、真假混。`audit` 做一次体检
（核验 → verdict 表 → 分级执行 → 重建索引，并包含 adopt）；`adopt` 只落
placement 约定。

核心模型是**文档—事实—代码**。每份文档必须有代码路径、issue 或需求锚点；
无锚点是孤儿。文档与事实冲突时，以代码和运行时裁决。

## 五分类

| 类型 | 判别 | 事实规则 |
| --- | --- | --- |
| 活文档 | 总览、字段表、Runbook 等现状 | 与代码一致；局部失真 fix，骨架失真 delete/重写 |
| 快照类 | dated 方案/决策 | 代码演进不是删除理由；被取代、已办结或超过两周就进 `_archive/` |
| 参考资料 | PDF/PPTX/厂商 HTML | 不核内容，只判是否仍需，放 `references/` 或预删 |
| 临时/handoff | 交接、一次性 dump | handoff → `${HANDOFF_DIR:-${TMPDIR:-/tmp}}`；dump → 项目 `tmp/` 或预删 |
| 非项目文档 | 与 workspace 需求无关 | 外迁 `${EXTERNAL_DOCS_DIR:-$HOME/Documents/claude-code/docs}/` |

## Placement 约定

`$ROOT` 与 advanced-plan 相同。`$ROOT/docs/` 包含唯一入口 `README.md`、
平铺文档、`references/`、`_archive/`、`advanced-plans/`（不碰内部）与
`incidents/`。adopt 时把三条规则写进 `docs/README.md`，CLAUDE.md 只留指针：

1. 新文档只落 `$ROOT/docs/` 或对应子仓，落地即登记一行；
2. 临时/handoff 去 `${HANDOFF_DIR:-${TMPDIR:-/tmp}}`；
3. 非项目文档去 `${EXTERNAL_DOCS_DIR:-$HOME/Documents/claude-code/docs}/`。

## Audit 流程

1. **Inventory**：扫顶层散落、`docs/`、`tmp/`；multi-repo 时不跨入子仓。
   初分五类，并按标题/锚点聚类重复簇。
2. **核验**：只核活文档和快照。并行取证 agent 先 `git fetch`，与远端集成分支
   比对，再逐条验证可核对声明；agent 只返回 claims，不裁决。issue 锚点查状态，
   关单还要核代码是否落地（关单 ≠ 上线）；快照只判是否被取代、办结（关单、迁移跑完）或超过两周，外部引用（别的仓、issue 正文）不阻塞归档；像项目文档但找不到锚点的孤儿单独问用户。
3. **Verdict 表**：文件 / 分类 / verdict（keep/fix/merge/move/archive/delete）/
   锚点 / 证据。版本链留最新、旧正式稿归档、中间草稿删；散片合并稿由主会话拟。
4. **分级执行**：批量档（move/明显垃圾/handoff）一次确认；活文档 fix、散片
   merge、拿不准的孤儿逐条确认。delete 永远先过表，宁可归档。
5. **移动**：先把要动的文件备份到 `/tmp`，并记下 `MOVES.txt`。用脚本按解析后的
   路径重算相对链接：被移文件里的链接和别处指向它的链接都要改；docs、memory、
   规则文件里 `docs/<name>` 这类文本路径改成新位置。改不到的外部引用列进汇报。
6. **收尾**：重写 `docs/README.md`，根目录只留活文档和两周内的快照；归档条目不删，
   改成 `_archive/` 路径放进「已归档」节。CLAUDE.md docs 段改为指针和三条规则。
   核对：`rg -F` 查每个被移文件名只剩新路径，README 本地链接逐个 `test -e`。

## 边界

- `docs/advanced-plans/` 归 advanced-plan + debrief；
- 常驻上下文本体归 context 模式；
- 子仓文档单独审时以该仓为 `$ROOT`；
- 远端团队仓的过时内容只标注，不代改。
