#!/usr/bin/env bun

import { readFileSync, readdirSync, lstatSync, unlinkSync, rmSync, symlinkSync } from "fs";
import { join, resolve } from "path";

const configPath = resolve(import.meta.dir, "../agents.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

function expandHome(p: string): string {
  return p.startsWith("~") ? join(process.env.HOME!, p.slice(1)) : p;
}

function statOrNull(p: string) {
  try { return lstatSync(p); } catch { return null; }
}

const force = process.argv.includes("--force");
const source = expandHome(config.source);
const targets: string[] = config.targets.map(expandHome);

const skills = readdirSync(source).filter((name) => !name.startsWith("."));

for (const target of targets) {
  console.log(`\ntarget: ${target}`);

  for (const skill of skills) {
    const linkPath = join(target, skill);
    const sourcePath = join(source, skill);
    const stat = statOrNull(linkPath);

    if (stat) {
      if (stat.isSymbolicLink()) {
        unlinkSync(linkPath);
        console.log(`  replaced symlink: ${skill}`);
      } else if (stat.isDirectory()) {
        if (!force) {
          console.warn(`  skip (dir exists, use --force to replace): ${skill}`);
          continue;
        }
        rmSync(linkPath, { recursive: true });
        console.log(`  replaced dir: ${skill}`);
      } else {
        if (!force) {
          console.warn(`  skip (file exists, use --force to replace): ${skill}`);
          continue;
        }
        unlinkSync(linkPath);
        console.log(`  replaced file: ${skill}`);
      }
    } else {
      console.log(`  linked: ${skill}`);
    }

    symlinkSync(sourcePath, linkPath);
  }
}

console.log("\ndone");
