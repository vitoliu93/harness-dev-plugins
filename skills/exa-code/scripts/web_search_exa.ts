import { parseArgs } from "node:util";
import { webSearchExa } from "./_client.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    query: { type: "string" },
    numResults: { type: "string" },
    livecrawl: { type: "string" },
    type: { type: "string" },
    contextMaxCharacters: { type: "string" },
  },
});

if (!values.query) {
  console.error("--query is required");
  process.exit(1);
}

const result = await webSearchExa({
  query: values.query,
  numResults: values.numResults ? Number(values.numResults) : undefined,
  livecrawl: values.livecrawl as "fallback" | "preferred" | undefined,
  type: values.type as "auto" | "fast" | undefined,
  contextMaxCharacters: values.contextMaxCharacters ? Number(values.contextMaxCharacters) : undefined,
});
console.log(result);
