// Codex dropped plugin-creator's validate_plugin.py; this covers what it checked
// that matters here: manifests parse, names are kebab-case, every version agrees,
// and every skill has the frontmatter both clients load.
import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const json = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

test("every version location agrees", () => {
  const market = json(".claude-plugin/marketplace.json");
  const versions = {
    claude: json(".claude-plugin/plugin.json").version,
    codex: json(".codex-plugin/plugin.json").version,
    jev: json("mods/jev/.claude-plugin/plugin.json").version,
    marketplace: market.metadata.version,
    ...Object.fromEntries(market.plugins.map((p: any) => [`entry:${p.name}`, p.version])),
  };
  expect(new Set(Object.values(versions)).size, JSON.stringify(versions)).toBe(1);
});

test("codex manifest is loadable", () => {
  const m = json(".codex-plugin/plugin.json");
  expect(m.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(existsSync(join(root, m.skills))).toBe(true);
});

test("every skill has name and description frontmatter", () => {
  for (const d of readdirSync(join(root, "skills"))) {
    const f = join(root, "skills", d, "SKILL.md");
    if (!existsSync(f)) continue;
    const fm = readFileSync(f, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    expect(fm, d).toMatch(new RegExp(`^name: ${d}$`, "m"));
    expect(fm, d).toMatch(/^description: \S/m);
  }
});
