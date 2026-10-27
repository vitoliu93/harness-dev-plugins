import { expect, test } from "bun:test"
import { stripImages } from "./slim-db"

const png = Buffer.from("fake image bytes")
const sha = new Bun.CryptoHasher("sha256").update(png).digest("hex")

test("base64 and hex images become size + hash, text stays", () => {
  const out = stripImages({
    experimental_content: [
      { type: "text", text: "Read image file: /tmp/a.png" },
      { type: "image", data: png.toString("base64"), mimeType: "image/png" },
    ],
    nested: { type: "image", image: { __type: "Uint8Array", hex: png.toString("hex") } },
  })
  expect(out.experimental_content[0]).toEqual({ type: "text", text: "Read image file: /tmp/a.png" })
  expect(out.experimental_content[1]).toEqual({ type: "image", mimeType: "image/png", bytes: png.length, sha256: sha })
  expect(out.nested).toEqual({ type: "image", bytes: png.length, sha256: sha })
})
