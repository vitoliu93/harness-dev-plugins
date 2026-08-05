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
  });

  test("missing API key exits 2 without reading request content", () => {
    const result = Bun.spawnSync(["bun", `${import.meta.dir}/call.ts`], {
      env: { ...process.env, DEEPSEEK_API_KEY: "" },
      stdin: Buffer.from("{}"),
    });

    expect(result.exitCode).toBe(2);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      "DEEPSEEK_API_KEY is required",
    );
  });
});
