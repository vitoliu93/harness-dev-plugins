# Model roster — powers, weaknesses, smart routing

Carrier chains live in ../SKILL.md; carrier mechanics in per-CLI sheets. **Every chain floor is an Anthropic subagent** (Agent tool): no vendor process, no foreign quota — dispatch there when carriers fail or task needs Anthropic models.

## gpt-5.6-sol (OpenAI) — hard-tier closer

- Coding Agent Index ~80 (SOTA tier); Terminal-Bench 2.1 ~88.8 (Sol Ultra ~91.9).
- 1M ctx; high/xhigh effort on cursor (`gpt-5.6-sol-high|-xhigh`).
- Strength: coding endurance, long unattended runs, subagent orchestration.
- Weakness: UI/design taste vs Claude family.
- **Route**: hardest agentic runs, long Q work, precision review / adversarial verification. Not look-and-feel judgment.

## grok-4.5 (xAI) — volume workhorse

- Coding Agent Index ~76; co-trained with Cursor on IDE sessions; fewer output tokens than Opus-class on SWE-Bench Pro (benchmark reports).
- Effort tiers low/med/high on cursor; high for red-team / audit sweeps.
- Weaknesses: novel-algorithm reasoning; occasional hallucinated API calls; high-recall/low-precision review style.
- **Route**: default Q dispatch — repo recon, bulk agentic coding, red-team sweeps. Pair findings with stronger verifier (gpt-5.6-sol or fable advisory) before acting.

## composer-2.5 (Cursor in-house) — fast/light tier

- Kimi K2.5 checkpoint base; Coding Agent Index ~62; SWE-Bench Multilingual ~79.8; cheaper per task than frontier peers.
- Medium-length in-IDE agent loops; vision supported on cursor-agent. ~270k ctx (reported).
- Weak at one-shot architecture/design-opinion questions.
- **Route**: fast cheap edits, routine loops, light vision. Escalate architecture calls.

## kimi-k3 (Moonshot) — 1M-ctx multimodal reader

- Open-weight 2.8T, native vision, 1M ctx; strong on long-context and frontend benchmarks (vendor/community reports).
- Vision + tool use on kimi-code carrier (kimi.md).
- Weaknesses: higher hallucination rate vs K2.x in some reports; over-proactive on ambiguous scope; security tasks need supervision; degrades if harness truncates thinking.
- **Route**: long-context research/digestion, vision-grounded work, frontend generation, diversity-core review. Check factual claims; small quota — spend deliberately.

## deepseek-v4 (DeepSeek, pro/flash) — bulk typist

- MIT-licensed; SWE-bench scored ~80.6 (near-frontier tier); LiveCodeBench competitive; 1M ctx; pro (1.6T/49B active) and flash (284B/13B) tiers.
- Text-only (graceful degrade — claude-variants.md); weaker sustained tool-use vs frontier.
- **Route**: bulk code generation, test authoring, migration/benchmark grinds. Vision or high-trust tool-use → other carriers or media-understanding fallback.

## anthropic family — the floor

- Not vendor dispatch: Agent-tool subagent on this session's quota.
- **Route**: needs loaded ecosystem (hooks/skills/session), Anthropic models specifically, or every carrier in chain failed.
