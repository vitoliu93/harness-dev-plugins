# Skill & Doc Style contract

Treat style as an execution contract, not copy polish.

## 1. Keep the routing interface to two lines

Write `description: >-` with exactly two content lines:

1. Start with an imperative verb and state what the skill does.
2. Start with an invocation phrase such as `Use when`, `Use before`, `Invoke when`, `当…时使用`, or `适用于…` and state when to invoke it.

Keep aliases, exclusions, provenance, examples, and implementation detail out of the description. Put aliases in eval fixtures or alias maps; put boundaries in the body.

## 2. Keep runtime docs in the present tense

Write `SKILL.md`, `references/`, runtime templates, and script guidance as commands, conditions, gates, and outputs.

Convert background material into this shape:

```
condition → required action → observable evidence
```

Move origin stories, dated proof, migration history, incident narratives, and decision archaeology to changelogs or historical design docs. Runtime docs may retain a date only when it changes current behavior, such as a schema compatibility cutoff.

## 3. Treat every path as a dependency declaration

- Resolve files owned by the skill from the loaded skill base directory.
- Resolve plugin files from a plugin-root variable.
- Resolve sibling repositories and external document roots from named environment variables.
- Resolve workspace, account, and environment ids at runtime or accept them through named variables.
- Allow standard home-directory defaults only when an environment variable can override them.
- Reference a remote repository when no local checkout is required.
- Skip or report an unavailable optional dependency; do not guess a developer-specific checkout.

Never make a skill depend on a user-specific absolute path, a personal workspace layout, or a fixed sibling-repository location.

## 4. Preserve gates through progressive disclosure

- Keep `SKILL.md` at or below 700 estimated tokens.
- Keep routing, invariants, destructive-operation gates, and the shortest execution skeleton in `SKILL.md`.
- Move depth and lookup tables to `references/`.
- Move repeatable mechanics to `scripts/`.
- Split prose walls into short imperative bullets; one bullet should express one decision.

Do not shorten by deleting safety gates or lifecycle transitions. Shorten by separating routing, judgment, and mechanics.

## 5. Sanitize public examples

Replace internal ticket ids, session ids, personal names, account labels, and module codenames with fictional values while preserving their shape. Keep real identifiers only when the runtime must call that exact external resource.

## Deterministic gate and semantic review

Run the deterministic linter first:

```bash
bun "$FORGE/skill_style.ts" --workspace-root "$PLUGIN/skills" --fail-on-issues
```

The linter checks description shape, invocation wording, internal ticket ids,
prose walls, fixed runtime ids, orphan surfaces, and non-portable paths. Keep
meaning-dependent judgments out of its regexes.

When runtime must retain a flagged literal, add a same-line, reasoned exception:

```text
# style-lint: allow local-path -- negative example, not an executable dependency
```

Use the narrow issue code; do not add file-wide exemptions.

Then run `skill-style-review` directly through Bun; the model call goes out
through `pi`:

```bash
STYLE_REVIEW=$PLUGIN/skills/skill-style-review
bun $STYLE_REVIEW/scripts/review.ts --skill-dir <skill-dir> --fail-on-issues
```

The semantic review blocks origin stories, incident lore, tuition narratives,
marketing language, meaning-level prose walls, and gate loss. Do not route this
check through another agent; the bundled runner is the execution boundary.

Do not add a word blacklist to silence judgment. Fix the contract, or add a narrow documented exception when a literal is required by runtime behavior.
