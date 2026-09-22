#!/usr/bin/env bun
/** Read-only adapter: frontmatter name and description of every SKILL.md the session can reach. Bodies are never read. */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SkillRow = { name: string; description: string };
/** Roots in priority order: workspace, then user directories, then enabled installed plugins. */
export async function skillRoots(home: string, cwd: string): Promise<[string, string][]> {
  const roots: [string, string][] = [[join(cwd, "skills"), ""], [join(home, ".claude", "skills"), ""], [join(home, ".agents", "skills"), ""]];
  try {
    const installed = JSON.parse(await Bun.file(join(home, ".claude", "plugins", "installed_plugins.json")).text());
    let enabled: Record<string, unknown> = {};
    try { enabled = JSON.parse(await Bun.file(join(home, ".claude", "settings.json")).text()).enabledPlugins ?? {}; } catch { /* no settings: every installed plugin counts */ }
    for (const [key, versions] of Object.entries(installed.plugins ?? {})) {
      if (enabled[key] === false || !Array.isArray(versions)) continue;
      for (const v of versions) if (typeof v?.installPath === "string") roots.push([join(v.installPath, "skills"), key.split("@")[0] ?? ""]);
    }
  } catch { /* no plugin catalogue */ }
  return roots;
}
export async function scanSkills(home: string, cwd: string): Promise<SkillRow[]> {
  const rows: SkillRow[] = [];
  for (const [root, plugin] of await skillRoots(home, cwd)) {
    if (!existsSync(root)) continue;
    for await (const rel of new Bun.Glob("*/SKILL.md").scan({ cwd: root, followSymlinks: true, onlyFiles: true })) {
      try {
        // ponytail: the first 8 KB holds any sane frontmatter; the body stays on disk.
        const head = (await Bun.file(join(root, rel)).slice(0, 8192).text()).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!head) continue;
        const fm = Bun.YAML.parse(head[1]!) as Record<string, unknown> | null;
        const name = String(fm?.name ?? rel.split("/")[0]);
        rows.push({ name: plugin ? `${plugin}:${name}` : name, description: String(fm?.description ?? "") });
      } catch { /* unreadable or bad YAML: skip this one */ }
    }
  }
  return rows;
}
if (import.meta.main) {
  try {
    const input = await Bun.stdin.text();
    if (input.length > 20_000) throw new Error("input-too-large");
    const { cwd } = JSON.parse(input);
    if (typeof cwd !== "string") throw new Error("bad-input");
    console.log(JSON.stringify(await scanSkills(process.env.HOME || homedir(), cwd)));
  } catch { console.error("scan-skills: unavailable"); process.exitCode = 1; }
}
