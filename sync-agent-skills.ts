#!/usr/bin/env bun
import { readdirSync, mkdirSync, symlinkSync, readlinkSync, lstatSync, unlinkSync } from "fs";
import { resolve, join } from "path";

const repoSkillsDir = resolve(import.meta.dir, "skills");
const targetDir = join(process.env.HOME!, ".agents/skills");

mkdirSync(targetDir, { recursive: true });

const skills = readdirSync(repoSkillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let created = 0, updated = 0, skipped = 0;

for (const skill of skills) {
  const src = join(repoSkillsDir, skill);
  const dest = join(targetDir, skill);

  let existing: ReturnType<typeof lstatSync> | null = null;
  try { existing = lstatSync(dest); } catch {}

  if (existing?.isSymbolicLink()) {
    if (readlinkSync(dest) === src) { skipped++; continue; }
    unlinkSync(dest); // stale → replace
  } else if (existing) {
    console.warn(`⚠  ${skill}: exists as a real file/dir, skipping`);
    continue;
  }

  symlinkSync(src, dest);
  console.log(`${existing ? "↻" : "✓"}  ${skill}`);
  existing ? updated++ : created++;
}

console.log(`\n${created} created, ${updated} updated, ${skipped} already up-to-date`);
