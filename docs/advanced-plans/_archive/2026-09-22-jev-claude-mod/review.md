# Review: Jev Claude Mod

## 过程要点

- 预审阶段定下的验收项，有三条后来被主审裁决推翻：A4 从 `$.model.classify` 改成必须走 `$.http.fetch` 调官方 Jev；A7 的密钥边界重写；recall 从「每会话一次」改成「每次输入可重判」。预审写死实现手段是失误，应该只写要达到的性质。
- 实现方冻结后自称的证据里，有一批强度不足：6 次 headless smoke 全部覆盖了 `CCOBS_DIR`，而 `pi-call` 的 `llm.json` 就取自该目录，导致旧 recall 静默 fail-open——那批「旧 recall 行为正常」的证据其实从未触发过注入路径。reviewer 自建测试台重跑才发现。
- reviewer 自跑的 5 臂真实会话是本次唯一能证明「接管生效」的证据。实现方原探针只在标记命中时才采样，有偏；改成总是采样后结论才成立。
- 一个被 reviewer 定轻的问题后来证明是真 bug：`projectKey()` 不规范化路径，而 Claude Code 自身按解析后路径存目录，符号链接 cwd 下永久查不到历史。定性错误来自「真实项目不走符号链接」这个未验证的假设。
- 分发形态反复三次：`--plugin-dir` 挂载 → 考虑折进 dev-kit → 最终独立 marketplace 条目。早点问「日常怎么用」而不是「怎么加载」，可以省掉两轮。
- 用户亲自指出的两个文档缺陷（`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` 的必须性、免挂载方式），实现方和 reviewer 都没主动发现——两边都只验了「命令能跑通」，没验「用户照着文档能不能用起来」。

## 结果

2.64.11（62c2ea2）与 2.64.12（865789b）已发布到 origin/main。最终 reviewer PASS。
