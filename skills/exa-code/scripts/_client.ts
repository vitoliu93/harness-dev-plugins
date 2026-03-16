const EXA_API_URL = "https://api.exa.ai";

function getApiKey(): string {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY environment variable is not set");
  return key;
}

export async function webSearchExa(args: {
  query: string;
  numResults?: number;
  livecrawl?: "fallback" | "preferred";
  type?: "auto" | "fast";
  contextMaxCharacters?: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    query: args.query,
    type: args.type ?? "auto",
    numResults: args.numResults ?? 8,
    livecrawl: args.livecrawl ?? "fallback",
    contents: {
      highlights: {
        maxCharacters: args.contextMaxCharacters ?? 10000,
      },
    },
  };

  const res = await fetch(`${EXA_API_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return formatSearchResults(data.results ?? []);
}

export async function getCodeContextExa(args: {
  query: string;
  tokensNum?: number;
}): Promise<string> {
  const charsEstimate = (args.tokensNum ?? 5000) * 4;

  const body: Record<string, unknown> = {
    query: args.query,
    type: "auto",
    numResults: 5,
    category: "github",
    contents: {
      text: {
        maxCharacters: charsEstimate,
      },
    },
  };

  const res = await fetch(`${EXA_API_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return formatSearchResults(data.results ?? []);
}

interface ExaResult {
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
  publishedDate?: string;
  author?: string;
}

function formatSearchResults(results: ExaResult[]): string {
  if (results.length === 0) return "No results found.";

  return results
    .map((r, i) => {
      const parts: string[] = [];
      parts.push(`## Result ${i + 1}: ${r.title ?? "Untitled"}`);
      if (r.url) parts.push(`URL: ${r.url}`);
      if (r.author) parts.push(`Author: ${r.author}`);
      if (r.publishedDate) parts.push(`Published: ${r.publishedDate}`);
      if (r.summary) parts.push(`\nSummary: ${r.summary}`);
      if (r.highlights?.length) {
        parts.push(`\n${r.highlights.join("\n\n")}`);
      }
      if (r.text) {
        parts.push(`\n${r.text}`);
      }
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}
