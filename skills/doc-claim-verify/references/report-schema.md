# 报告契约

报告是 JSON 文件，路径由 `DOC_CLAIM_REPORT` 指定，默认 `${TMPDIR:-/tmp}/doc-claim-verify.json`。

## Schema

```jsonc
{
  "doc": "docs/widget-pipeline.md",          // 被核验文档，仓库相对路径
  "baseline": {"ref": "origin/dev", "sha": "a1b2c3d"},
  "repos": [{"name": "widget-core", "ref": "origin/dev", "sha": "e4f5a6b"}],
  "claims": [
    {
      "id": "C1",
      "section": "任务调度",
      "quote": "调度器由 WidgetScheduler.enqueue 触发",
      "verdict": "true",                      // true | false | undecidable
      "evidence": [
        {
          "probe": "rg -n 'class WidgetScheduler' src/",
          "hit": "src/scheduler/widget.py:41: class WidgetScheduler:",
          "location": "src/scheduler/widget.py:41"
        }
      ]
    },
    {
      "id": "C2",
      "section": "配置",
      "quote": "WIDGET_TIMEOUT 默认 30 秒",
      "verdict": "false",
      "evidence": [{"probe": "rg -n 'WIDGET_TIMEOUT' src/", "hit": "src/config.py:18: WIDGET_TIMEOUT = 60", "location": "src/config.py:18"}],
      "counter_evidence": "代码中默认值为 60，文档写 30"
    },
    {
      "id": "C3",
      "section": "上线",
      "quote": "灰度期间错误率低于千分之一",
      "verdict": "undecidable",
      "reason": "运行期指标，代码库内无真源"
    }
  ],
  "skipped": [{"quote": "本文档建议尽早接入", "why": "建议，非事实断言"}],
  "summary": {
    "total": 3, "true": 1, "false": 1, "undecidable": 1,
    "hit_rate": 0.5,                          // true / (true + false)
    "truncated": false
  },
  "notes": ["本地工作区有未推送改动，取证以 origin/dev 为准"]
}
```

## 字段规则

- `claims[].verdict` 三值封闭，无第四种取值。
- `false` 必须有 `counter_evidence`；`undecidable` 必须有 `reason`；`true`/`false` 必须有非空 `evidence`。
- `hit_rate` 分母不含 `undecidable`。
- 分批写盘中途中断 → `summary.truncated = true`，并在 `notes` 写已完成到哪个小节。

## 对话内回执

一行，形如：

```
report: /tmp/doc-claim-verify.json · 30 条 · true 21 / false 9 / undecidable 0 · 命中率 0.70
```
