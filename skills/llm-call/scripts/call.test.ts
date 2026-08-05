import { describe, expect, test } from "bun:test";
import { buildRequest, isRetryable, normalizeUsage, parseInput } from "./call";

const messages = [{ role: "user" as const, content: "Return JSON." }];

describe("input contract", () => {
  test("defaults to max effort and 8192 output tokens", () => {
    const input = parseInput({ messages });

    expect(input.effort).toBe("max");
    expect(input.max_tokens).toBe(8_192);
  });

  test("rejects invalid roles and effort", () => {
    expect(() => parseInput({ messages: [{ role: "tool", content: "x" }] })).toThrow(
      "role is invalid",
    );
    expect(() => parseInput({ messages, effort: "medium" })).toThrow(
      "effort must be none, high, or max",
    );
  });
});

describe("DeepSeek request mapping", () => {
  test("max enables thinking and the largest effort tier", () => {
    const request = buildRequest(parseInput({ messages, effort: "max" }));

    expect(request.thinking).toEqual({ type: "enabled" });
    expect(request.reasoning_effort).toBe("max");
    expect(request.max_tokens).toBe(8_192);
  });

  test("high enables balanced thinking", () => {
    const request = buildRequest(parseInput({ messages, effort: "high" }));

    expect(request.thinking).toEqual({ type: "enabled" });
    expect(request.reasoning_effort).toBe("high");
    expect(request.max_tokens).toBe(4_096);
  });

  test("none disables thinking and omits reasoning effort", () => {
    const request = buildRequest(parseInput({ messages, effort: "none" }));

    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.reasoning_effort).toBeUndefined();
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
