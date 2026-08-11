#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Content is either plain text or OpenAI-shaped blocks (text / image_url) for
// vision models. Blocks pass through unvalidated beyond their `type` — the
// provider is the authority on block shape.
export type ContentBlock = { type: string; [k: string]: unknown };
export type Message = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};
export type CallInput = {
  messages: Message[];
  model?: string;
  base_url?: string;
  api_key?: string;
  max_tokens: number;
  temperature?: number;
  response_format?: "text" | "json_object";
};

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 32_768;

// Shared API-direct LLM config, same file distill.ts reads. Resolution:
// llm.json ({"base_url","model","api_key"}) > DEEPSEEK_* env > built-in defaults.
export function llmConfigPath(): string {
  return join(process.env.CCOBS_DIR ?? join(homedir(), ".claude", "observability"), "llm.json");
}

export function resolveCfg(): { base_url: string; model: string; api_key: string } | null {
  const path = llmConfigPath();
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return {
    base_url: process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL,
    api_key: apiKey,
  };
}
const ROLES = new Set<Message["role"]>(["system", "user", "assistant"]);

function fail(message: string): never {
  console.error(`llm-call: ${message}`);
  process.exit(2);
}

export function parseInput(value: unknown): CallInput {
  if (!value || typeof value !== "object") throw new Error("input must be a JSON object");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }
  const messages = input.messages.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`messages[${index}] must be an object`);
    const message = raw as Record<string, unknown>;
    const role = String(message.role ?? "") as Message["role"];
    if (!ROLES.has(role)) throw new Error(`messages[${index}].role is invalid`);
    if (Array.isArray(message.content)) {
      const blocks = message.content as ContentBlock[];
      if (!blocks.length) throw new Error(`messages[${index}].content must be non-empty`);
      for (const [i, b] of blocks.entries()) {
        if (!b || typeof b !== "object" || !String(b.type ?? "").trim()) {
          throw new Error(`messages[${index}].content[${i}] must be a block with a type`);
        }
      }
      return { role, content: blocks };
    }
    const content = String(message.content ?? "");
    if (!content.trim()) throw new Error(`messages[${index}].content must be non-empty`);
    return { role, content };
  });
  const responseFormat = String(input.response_format ?? "text");
  if (!["text", "json_object"].includes(responseFormat)) {
    throw new Error("response_format must be text or json_object");
  }
  const maxTokens = Number(input.max_tokens ?? DEFAULT_MAX_TOKENS);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 65_536) {
    throw new Error("max_tokens must be an integer from 1 to 65536");
  }
  let temperature: number | undefined;
  if (input.temperature !== undefined) {
    temperature = Number(input.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error("temperature must be between 0 and 2");
    }
  }
  const optStr = (key: "model" | "base_url" | "api_key"): string | undefined => {
    if (input[key] === undefined) return undefined;
    const value = String(input[key]).trim();
    if (!value) throw new Error(`${key} must be non-empty`);
    return value;
  };
  const model = optStr("model");
  const baseUrl = optStr("base_url");
  // A foreign base_url with the configured provider's model name yields an
  // opaque 404 — demand the pair.
  if (baseUrl && !model) throw new Error("base_url requires model");
  return {
    messages,
    model,
    base_url: baseUrl,
    api_key: optStr("api_key"),
    max_tokens: maxTokens,
    temperature,
    response_format: responseFormat as CallInput["response_format"],
  };
}

export function buildRequest(input: CallInput, defaultModel = DEFAULT_MODEL): Record<string, unknown> {
  const request: Record<string, unknown> = {
    model: input.model ?? defaultModel,
    messages: input.messages,
    max_tokens: input.max_tokens,
    stream: false,
    thinking: { type: "enabled" },
    reasoning_effort: "max",
  };
  if (input.temperature !== undefined) request.temperature = input.temperature;
  if (input.response_format === "json_object") {
    request.response_format = { type: "json_object" };
  }
  return request;
}

export function normalizeUsage(usage: unknown): Record<string, number> | null {
  if (!usage || typeof usage !== "object") return null;
  const value = usage as Record<string, unknown>;
  const normalized: Record<string, number> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    if (typeof value[key] === "number") normalized[key] = value[key];
  }
  const details = value.completion_tokens_details;
  const reasoningTokens =
    details && typeof details === "object"
      ? (details as Record<string, unknown>).reasoning_tokens
      : undefined;
  if (typeof reasoningTokens === "number") normalized.reasoning_tokens = reasoningTokens;
  return Object.keys(normalized).length ? normalized : null;
}

export function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  if ((error as { retryable?: unknown }).retryable === false) return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status !== "number") return true;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function main(): Promise<void> {
  let input: CallInput;
  try {
    const raw = await Bun.stdin.text();
    if (!raw.trim()) throw new Error("stdin must contain one JSON request");
    input = parseInput(JSON.parse(raw));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  // Request-level base_url/api_key override the resolved config, so one caller
  // can route a single request to a different provider (e.g. a vision model).
  const cfg = { ...resolveCfg(), ...(input.base_url && { base_url: input.base_url }), ...(input.api_key && { api_key: input.api_key }) };
  if (!cfg.api_key) fail(`config required: ${llmConfigPath()}, DEEPSEEK_API_KEY, or request api_key`);

  // ponytail: dynamic import so the globally installed SDK (`bun add -g openai@7`)
  // stays out of `bun test`, which does not resolve global packages.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: cfg.api_key,
    baseURL: cfg.base_url ?? DEFAULT_BASE_URL,
    maxRetries: 0,
    timeout: 300_000,
  });
  const request = buildRequest(input, cfg.model ?? DEFAULT_MODEL);

  let lastError = "unknown completion error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await client.chat.completions.create(request as never);
      const choice = completion.choices[0];
      const content = choice?.message?.content;
      if (!content?.trim()) {
        // length-starved CoT is deterministic — retrying the same request is pure waste
        throw Object.assign(new Error(`empty content (finish_reason=${choice?.finish_reason ?? "missing"})`), { retryable: false });
      }
      console.log(
        JSON.stringify({
          model: completion.model ?? request.model,
          reasoning_effort: "max",
          content,
          finish_reason: choice.finish_reason,
          usage: normalizeUsage(completion.usage),
        }),
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 1 || !isRetryable(error)) break;
      await Bun.sleep(250);
    }
  }
  fail(lastError);
}

if (import.meta.main) await main();
