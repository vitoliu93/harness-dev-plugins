import { parseArgs } from "node:util";
import { getCodeContextExa } from "./_client.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    query: { type: "string" },
    tokensNum: { type: "string" },
  },
});

if (!values.query) {
  console.error("--query is required");
  process.exit(1);
}

const result = await getCodeContextExa({
  query: values.query,
  tokensNum: values.tokensNum ? Number(values.tokensNum) : undefined,
});
console.log(result);
