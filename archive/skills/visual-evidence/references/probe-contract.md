# 探针与派发契约

## 探针输出契约

探针是一段可重跑的浏览器命令序列或断言脚本，对应一个验收项。它只输出一个 JSON 对象到 stdout：

```json
{
  "item": "timeline-item-selection-outline",
  "verdict": "PASS",
  "evidence": { "outlineWidth": "2px", "boundingWidth": 148.5, "selectedId": "item-3" },
  "repro": ["deep-link <url>", "click 列表行 item-3", "read computed style of .selected"]
}
```

- `verdict`：`PASS | FAIL | BLOCKED`。
- `evidence`：至少一个数值或结构化事实，不放叙述句。
- `BLOCKED` 必须带 `reason` 字段。
- 退出码：PASS → 0，FAIL → 1，BLOCKED → 2。
- 探针不改被测数据；只读或只操作测试夹具。

存放位置、命名、批量跑法由调用方项目约定，本 skill 不规定。

## 复验轮

首轮人肉验证通过 → 沉淀探针。之后的复验直接跑探针集合，聚合各条 JSON：

- 全 PASS → 一行摘要回报。
- 任一 FAIL → 只对该项重新进浏览器人肉取证，其余不动。
- BLOCKED → 先修探针（选择器漂移、登录失效），再判被测行为。

## 回报格式

派发纪律见 SKILL.md 的 Hard gates，本文件不重复。

每项一行：

```
[PASS] 时间线条目选中态 — outlineWidth=2px, selectedId=item-3 · repro: deep-link → 点列表行 → 读计算样式
[FAIL] 图层面板角标 — badge 元素不存在（已确认无抑制分支）· 截图 ./fail-badge.png
```

结尾一行计数：`n 项 · PASS/FAIL/BLOCKED`。
