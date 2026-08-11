import { describe, expect, test } from "bun:test";
import { buildRequest, isRetryable, normalizeUsage, parseInput } from "./call";

const messages = [{ role: "user" as const, content: "Return JSON." }];

describe("input contract", () => {
  test("defaults to the max thinking budget", () => {
    expect(parseInput({ messages }).max_tokens).toBe(32_768);
  });

  test("rejects invalid roles and output budgets", () => {
    expect(() => parseInput({ messages: [{ role: "tool", content: "x" }] })).toThrow(
      "role is invalid",
    );
    expect(() => parseInput({ messages, max_tokens: 99_999 })).toThrow("max_tokens must be");
  });

  test("carries multimodal content blocks through untouched", () => {
    const blocks = [
      { type: "text", text: "what is this?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBOR" } },
    ];
    const parsed = parseInput({ messages: [{ role: "user", content: blocks }] });
    expect(parsed.messages[0].content).toEqual(blocks);
  });

  test("rejects empty or typeless content blocks", () => {
    expect(() => parseInput({ messages: [{ role: "user", content: [] }] })).toThrow(
      "must be non-empty",
    );
    expect(() => parseInput({ messages: [{ role: "user", content: [{ text: "x" }] }] })).toThrow(
      "must be a block with a type",
    );
  });

  test("accepts a per-request provider override, and demands model with base_url", () => {
    const parsed = parseInput({
      messages,
      model: "openai/gpt-5.6-luna",
      base_url: "https://openrouter.ai/api/v1",
      api_key: "sk-test",
    });
    expect(parsed.base_url).toBe("https://openrouter.ai/api/v1");
    expect(parsed.api_key).toBe("sk-test");
    expect(() => parseInput({ messages, base_url: "https://openrouter.ai/api/v1" })).toThrow(
      "base_url requires model",
    );
  });
});

describe("DeepSeek request mapping", () => {
  test("always enables thinking at max effort", () => {
    const request = buildRequest(parseInput({ messages }));

    expect(request.thinking).toEqual({ type: "enabled" });
    expect(request.reasoning_effort).toBe("max");
    expect(request.max_tokens).toBe(32_768);
  });

  test("maps JSON Output through the OpenAI request shape", () => {
    const request = buildRequest(
      parseInput({ messages, response_format: "json_object", temperature: 0 }),
    );

    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.temperature).toBe(0);
  });
});

describe("response and failure contract", () => {
  test("flattens usage and promotes reasoning tokens", () => {
    expect(
      normalizeUsage({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 12, ignored: 8 },
        provider_private_field: "drop",
      }),
    ).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      reasoning_tokens: 12,
    });
  });

  test("retries only transient status codes", () => {
    expect(isRetryable({ status: 401 })).toBeFalse();
    expect(isRetryable({ status: 400 })).toBeFalse();
    expect(isRetryable({ status: 429 })).toBeTrue();
    expect(isRetryable({ status: 503 })).toBeTrue();
    expect(isRetryable(new Error("network"))).toBeTrue();
    expect(isRetryable(Object.assign(new Error("empty content"), { retryable: false }))).toBeFalse();
  });

  // A request may carry its own api_key, so the config gate runs after parsing.
  const noConfig = (request: unknown): { exitCode: number; stderr: string } => {
    // CCOBS_DIR points at an empty dir so a real machine-local llm.json can't leak in.
    const emptyDir = `${import.meta.dir}/.test-empty-ccobs`;
    require("node:fs").mkdirSync(emptyDir, { recursive: true });
    const result = Bun.spawnSync(["bun", `${import.meta.dir}/call.ts`], {
      env: { ...process.env, DEEPSEEK_API_KEY: "", CCOBS_DIR: emptyDir },
      stdin: Buffer.from(JSON.stringify(request)),
    });
    require("node:fs").rmSync(emptyDir, { recursive: true, force: true });
    return { exitCode: result.exitCode, stderr: new TextDecoder().decode(result.stderr) };
  };

  test("missing config exits 2", () => {
    const result = noConfig({ messages: [{ role: "user", content: "hi" }], max_tokens: 16 });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("config required");
  });

  test("a request api_key satisfies the config gate", () => {
    const result = noConfig({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 16,
      model: "openai/gpt-5.6-luna",
      base_url: "http://127.0.0.1:1/v1",
      api_key: "sk-test",
    });
    // Failure is the unreachable base_url, not the gate.
    expect(result.exitCode).toBe(2);
    expect(result.stderr).not.toContain("config required");
  });

  test("llm.json satisfies the config gate without DEEPSEEK_API_KEY", () => {
    const dir = `${import.meta.dir}/.test-llmjson-ccobs`;
    const fs = require("node:fs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      `${dir}/llm.json`,
      JSON.stringify({ base_url: "http://127.0.0.1:1/v1", model: "m", api_key: "k" }),
    );
    const result = Bun.spawnSync(["bun", `${import.meta.dir}/call.ts`], {
      env: { ...process.env, DEEPSEEK_API_KEY: "", CCOBS_DIR: dir },
      stdin: Buffer.from(
        JSON.stringify({ messages: [{ role: "user", content: "hi" }], max_tokens: 16 }),
      ),
    });
    fs.rmSync(dir, { recursive: true, force: true });

    // Config resolved from llm.json; failure is the unreachable base_url, not the gate.
    expect(result.exitCode).toBe(2);
    expect(new TextDecoder().decode(result.stderr)).not.toContain("config required");
  });
});
