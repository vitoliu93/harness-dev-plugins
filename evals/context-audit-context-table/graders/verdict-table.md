---
type: llm
focus: last_message
---

工作目录里 CLAUDE.md 先 `@AGENTS.md`，再列 6 条：测试命令（与 AGENTS.md 重复）、`scripts/deploy.sh` 发布（实际只有 `scripts/release.sh`）、"写干净可维护的代码"、`src/math.ts` 的 add 函数说明、金额用整数分及原因（与 AGENTS.md 重复）、camelCase 命名。
逐条核对最后一条回复，全部满足才通过：
- 有一张表，逐条给 CLAUDE.md 的条目打分类，分类用 keep / merge / drop / update / relocate（或对应中文）。
- 把 `scripts/deploy.sh` 标为过期或需更新，并指出实际文件是 `scripts/release.sh`。
- 把"写干净可维护的代码"或 camelCase 或 add 函数说明中至少两条标为删除。
- 指出测试命令和金额规则与 AGENTS.md 重复，并保留金额规则的原因（浮点误差），没有把它整条删掉。
- 明确说还没改文件，等用户确认后再执行。
