# Vendor manifest — per-machine fleet record

The concrete fleet (installed CLIs, quota pools, model slots) is machine-local
and must never be hardcoded in this skill. It lives in one JSON file read at
dispatch time. The skill docs carry the portable part — provider 坑
(carrier sheets) and the capability-level [model-use-guide.md](model-use-guide.md).

## Location

- Default: `${CCOBS_DIR:-$HOME/.claude/observability}/vendor-manifest.json` —
  the same observability home as ccobs (`obs.db`) and the dispatch ledger
  (`dispatch/ledger.md`).
- Override: `$VENDOR_MANIFEST` env var.
- Never committed to the plugin; it is personal machine state.

## Runtime read order

1. Read the manifest at the path above. If missing → bootstrap (below).
2. Verify each cell's CLI exists (`command -v <cli>`); skip cells whose binary
   or rc function is gone.
3. Pick a capability ([model-use-guide.md](model-use-guide.md)), then the slot
   model, then the cell's carrier sheet for launch 坑.
4. `status: unknown` → probe before relying (vendor-onboarding rung ②).
5. `status: unsupported` cells are verdict history — never dispatched to.

## Bootstrap when missing

1. Copy `vendor-manifest.example.json` (this folder) to the manifest path.
2. Delete cells whose CLI is not installed; add cells you have that aren't listed.
3. For each kept cell, fill `slots` from the carrier's model list
   (`cursor-agent --list-models`, rc slot maps in
   `${VENDOR_SHELL_RC:-$HOME/.zshrc}`, provider docs).
4. Record `status` per the [vendor-onboarding.md](vendor-onboarding.md) ladder;
   a fresh cell stays `unknown` until rungs pass.
5. Self-check after every hand edit (exit 0 = valid JSON):
   `bun -e 'JSON.parse(await Bun.file(process.argv.at(-1)).text())' "$MANIFEST"`

## Schema

| field | type | meaning |
|---|---|---|
| `version` | int | schema version; 1 |
| `updated` | string | ISO date of last reconcile |
| `default_pool` | string | quota pool to prefer for the Q gate |
| `quota_pools` | map | pool name → subscription note |
| `cells` | array | one per carrier CLI |

### cell

| field | type | meaning |
|---|---|---|
| `id` | string | unique cell name |
| `cli` | string | binary or rc-function name |
| `enabled` | bool | `false` = verdict history only (e.g. a disabled carrier) |
| `quota_pool` | string | key into `quota_pools` |
| `carrier_sheet` | string | `references/<sheet>.md` holding the 坑 |
| `capabilities` | array | `index` `vision` `resume` `unattended` — long-context ability is expressed by a `long_context` slot, not listed here |
| `launch` | string | template incantation; `<slot>` = the chosen slot model |
| `notes` | string | cell-level 坑 |
| `slots` | map | role key → slot (below) |

### slot

Role keys are defined by [model-use-guide.md](model-use-guide.md):
`hard` · `default_q` · `fast_light` · `long_context` · `bulk`.

| field | type | meaning |
|---|---|---|
| `model` | string | concrete model name for this role |
| `family` | string | vendor family for the diversity gate (anthropic / openai / xai / moonshot / deepseek / zhipu / cursor / …) |
| `status` | string | `supported` · `unknown` (probe first) · `unsupported` (never dispatch) |
| `note` | string | slot-level caveat |
