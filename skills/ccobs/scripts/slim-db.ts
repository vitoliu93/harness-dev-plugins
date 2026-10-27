#!/usr/bin/env bun
// Image bytes stay out of obs.db: ingest stores {type, mimeType, bytes, sha256} instead.
// Run once on a DB filled before that rule: strips message_parts images in place (the source
// DB is modified, so back it up first), then writes a compacted copy with VACUUM INTO.
// Stop the hourly launchd ingest while it runs, check the copy, then swap it in.
//
// Usage: bun slim-db.ts [path/to/obs.db]   → writes obs.slim.db next to it

import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

function meta(bytes: Buffer) {
  return { bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }
}

// Cursor images arrive as {type:"image", data:<base64>, mimeType} or {type:"image", image:{hex}}.
export function stripImages(value: any): any {
  if (Array.isArray(value)) return value.map(stripImages)
  if (!value || typeof value !== "object") return value
  if (value.type === "image") {
    const { data, image, ...rest } = value
    if (typeof data === "string") return { ...rest, ...meta(Buffer.from(data, "base64")) }
    if (typeof image?.hex === "string") return { ...rest, ...meta(Buffer.from(image.hex, "hex")) }
  }
  const out: any = {}
  for (const [k, v] of Object.entries(value)) out[k] = stripImages(v)
  return out
}

if (import.meta.main) {
  const src = process.argv[2] ?? join(process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability"), "obs.db")
  const dst = join(dirname(src), "obs.slim.db")
  if (existsSync(dst)) throw new Error(`${dst} already exists`)
  const db = new Database(src)
  const rows = db.prepare(
    `SELECT part_id, data_json FROM message_parts WHERE data_json LIKE '%"type":"image"%'`,
  ).all() as { part_id: string; data_json: string }[]
  const put = db.prepare("UPDATE message_parts SET data_json = ? WHERE part_id = ?")
  let changed = 0
  db.transaction(() => {
    for (const r of rows) {
      const slim = JSON.stringify(stripImages(JSON.parse(r.data_json)))
      if (slim !== r.data_json) { put.run(slim, r.part_id); changed++ }
    }
  })()
  db.exec(`VACUUM INTO '${dst.replaceAll("'", "''")}'`)
  db.close()
  console.log(`slim-db: ${changed}/${rows.length} rows stripped → ${dst}`)
}
