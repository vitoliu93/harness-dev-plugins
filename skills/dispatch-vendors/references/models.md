# Model roster — powers, weaknesses, smart routing

Web-researched 2026-07-31 (vendor announcements, Terminal-Bench 2.1 /
SWE-bench / Artificial Analysis Coding Agent Index, community reports —
search-result level, not primary-doc verified). Carrier chains live in
../SKILL.md; carrier mechanics in the per-CLI sheets. **The floor of every
chain is an Anthropic subagent** (Agent tool): no vendor process, no foreign
quota, full session ecosystem — dispatch there when every carrier is down or
the task needs Anthropic models anyway.

## gpt-5.6-sol (OpenAI) — the hard-tier closer

- Coding Agent Index ~80 (SOTA), above Fable 5, at <½ the output tokens/time
  of rivals; Terminal-Bench 2.1 88.8 (Sol Ultra 91.9).
- 1M ctx; high/xhigh effort tiers on cursor (`gpt-5.6-sol-high|-xhigh`).
- Community: wins on coding endurance — ran a full day unattended, handles
  subagents well; loses UI/design taste to Claude.
- **Route**: hardest agentic runs, long unattended Q work, precision review /
  adversarial verification. NOT look-and-feel judgment.

## grok-4.5 (xAI) — the volume workhorse

- Coding Agent Index ~76 (1pt behind Fable 5); co-trained with Cursor on real
  IDE sessions; ~4.2× fewer output tokens than Opus-4.8-max on SWE-Bench Pro.
- Effort tiers low/med/high on cursor; high is the pick (already verified
  live: adversarial audit with computed evidence — cursor-agent.md).
- Weaknesses: below frontier on novel-algorithm reasoning; hallucinated API
  calls reported; review style is high-recall/low-precision — flags plenty,
  ranks poorly.
- **Route**: default Q dispatch — repo recon, bulk agentic coding, red-team
  sweeps. Pair its findings with a stronger verifier (gpt-5.6-sol or fable
  advisory) before acting.

## composer-2.5 (Cursor in-house) — the fast/light tier

- Built on a Kimi K2.5 checkpoint; Coding Agent Index ~62; SWE-Bench
  Multilingual 79.8; 10-60× cheaper per task than frontier peers.
- Tuned for medium-length in-IDE agent loops on Cursor's own tools; vision
  verified live (../cursor-agent.md). ~270k ctx (user-reported).
- Weak at one-shot architecture/design-opinion questions.
- **Route**: fast cheap edits, routine loops at scale, light vision tasks.
  Escalate architecture calls up a tier.

## kimi-k3 (Moonshot) — the 1M-ctx multimodal reader

- Open-weight 2.8T, native vision, 1M ctx used single-agent without
  compression (BrowseComp 90.4); tops several real-world task benches and
  Frontend Code Arena.
- Vision + tool use + long-form verified live on kimi-code (kimi.md).
- Weaknesses: hallucination rate jumped K2.6→K3 (~39%→51%) — confidently
  wrong more often; over-proactive on ambiguous scope; weak on security
  tasks; degrades if the harness truncates its thinking.
- **Route**: long-context research/digestion, vision-grounded work
  (screenshots/diagrams), frontend generation, diversity-core review.
  Verify factual claims; don't leave it unsupervised on security-sensitive
  work. Quota small — spend deliberately.

## deepseek-v4 (DeepSeek, pro/flash) — the bulk typist

- MIT-licensed; SWE-bench Verified ~80.6 (near-frontier), LiveCodeBench
  ahead of peers; 1M ctx; pro (1.6T/49B active) and flash (284B/13B) tiers.
- V4 fixed V3.2's dropped-reasoning-across-turns flaw in agentic flows.
- Text-only (graceful degrade — claude-variants.md); DeepSeek self-assesses
  ~3-6 months behind frontier; sustained tool-use and hallucination remain
  weak spots.
- **Route**: bulk code generation, test authoring, migration/benchmark
  grinds — cheap and detached. Anything vision or high-trust tool-use goes
  elsewhere (or through the media-understanding fallback).

## anthropic family — the floor

- Not a vendor dispatch: an Agent-tool subagent on this session's quota.
- **Route**: task needs the loaded ecosystem (hooks/skills/session context),
  needs Anthropic models specifically, or every carrier in a chain failed —
  the fallback that is always up.
