# Vendor manifest — per-machine fleet record

The concrete fleet (installed CLIs, quota pools, model slots) is machine-local
and must never be hardcoded in this skill. It lives in one JSON file read at
dispatch time. The skill docs carry the portable part — provider 坑
(carrier sheets) and the role-level [model-use-guide.md](model-use-guide.md).

## Location

- Default: `${CCOBS_DIR:-$HOME/.claude/observability}/vendor-manifest.json` —
  the same observability home as ccobs (`obs.db`) and the dispatch ledger
  (`dispatch/ledger.md`).
- Override: `$VENDOR_MANIFEST` env var.
- Never committed to the plugin; it is personal machine state.

## Runtime read order

1. Read the manifest at the path above. If missing → bootstrap (below).
2. Verify each cell's CLI exists (`command -v <cli>`); skip cells whose binary
   is gone.
3. Pick the role — `advisor` or `executor`
   ([model-use-guide.md](model-use-guide.md)) — then a model from that role's
   list, then the cell's carrier sheet for launch 坑.
4. Pick the effort level for this task; floor is `effort_policy.floor`. Pass it
   with the cell's `effort_syntax`.
5. `status: unknown` → probe before relying (vendor-onboarding rung ②).
6. `status: unsupported` is verdict history — never dispatched to.
7. Primary carrier's pool exhausted → `fallback_route` (same model, other
   wallet), or another cell holding the same role.

## Bootstrap when missing

1. Copy `vendor-manifest.example.json` (this folder) to the manifest path.
2. Delete cells whose CLI is not installed; add cells you have that aren't listed.
3. For each kept cell, fill `slots` from the carrier's model list
   (`cursor-agent --list-models`, `pi --list-models`, provider docs).
4. Record `status` per the [vendor-onboarding.md](vendor-onboarding.md) ladder;
   a fresh model stays `unknown` until rungs pass.
5. Self-check after every hand edit (exit 0 = valid JSON):
   `bun -e 'JSON.parse(await Bun.file(process.argv.at(-1)).text())' "$MANIFEST"`

## Schema

| field | type | meaning |
|---|---|---|
| `version` | int | schema version; 1 |
| `updated` | string | ISO date of last reconcile |
| `default_pool` | string | quota pool to prefer for the Q gate |
| `roles` | map | role name → what it is for; the two roles are fixed |
| `effort_policy` | object | `floor` (lowest allowed level), `default` (always `null`), `rule` |
| `fallback_route` | object | how to reach any model when its primary pool is down; not a cell |
| `quota_pools` | map | pool name → wallet note |
| `cells` | array | one per carrier CLI × quota pool |

One CLI can appear in several cells when it bills to several wallets (pi does:
one cell per provider pool). `quota_pool` is a cell-level field — that split is
what keeps "check the pool before dispatch" meaningful.

### effort

No default level is stored. Pick per task from its difficulty, never below
`effort_policy.floor`. The syntax differs per carrier — model-name suffix,
`--thinking`, `--effort`, or none at all — so each cell carries its own
`effort_syntax`. A carrier with no effort knob says so there.

### fallback_route

A route, not a roster entry: same model, different wallet, used only when the
primary cell's pool is exhausted or the carrier is down. It never competes in
normal selection and never appears in `cells`.

### cell

| field | type | meaning |
|---|---|---|
| `id` | string | unique cell name |
| `cli` | string | binary name |
| `enabled` | bool | `false` = verdict history only |
| `quota_pool` | string | key into `quota_pools` |
| `carrier_sheet` | string | `references/<sheet>.md` holding the 坑 |
| `capabilities` | array | `index` `vision` `resume` `unattended` — context length is a slot note, not a capability |
| `launch` | string | template incantation; `<slot>` = the chosen model |
| `effort_syntax` | string | how this carrier takes the effort level |
| `notes` | string | cell-level 坑 |
| `slots` | map | role key → array of models (below) |

### slot

Role keys are `advisor` and `executor` only
([model-use-guide.md](model-use-guide.md)). Each maps to an **array** — a cell
can offer several models in one role.

| field | type | meaning |
|---|---|---|
| `model` | string | concrete model name, no effort baked in unless the carrier has no other way |
| `family` | string | vendor family for the diversity gate (anthropic / openai / xai / moonshot / deepseek / zhipu / google / …) |
| `status` | string | `supported` · `unknown` (probe first) · `unsupported` · `quota-exhausted` |
| `note` | string | model-level caveat: context window, text-only, probe date, where to reroute |
