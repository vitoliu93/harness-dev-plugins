#!/usr/bin/env bash
set -e
mkdir -p src
cat > package.json <<'J'
{ "name": "note-cli", "type": "module", "scripts": { "test": "bun test" } }
J
cat > src/cli.ts <<'J'
import { listNotes } from "./notes";
const args = process.argv.slice(2);
if (args[0] === "list") for (const n of listNotes()) console.log(`${n.id}\t${n.title}`);
J
cat > src/notes.ts <<'J'
export type Note = { id: number; title: string; tags: string[] };
export function listNotes(): Note[] { return [{ id: 1, title: "hello", tags: ["a"] }]; }
J
cat > README.md <<'J'
# note-cli
`note-cli list` prints notes.
J
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.com commit -qm init
