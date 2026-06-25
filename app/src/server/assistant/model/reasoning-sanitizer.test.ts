import { describe, it, expect } from "vitest";
import {
  REASONING_DELTA_KEYS,
  assertNoReasoningInText,
  stripReasoningFromDelta,
} from "./reasoning-sanitizer";

describe("stripReasoningFromDelta", () => {
  it("returns content and tool_calls without reasoning keys", () => {
    const delta = {
      content: "Hello",
      reasoning_details: [{ text: "hidden" }],
      reasoning_content: "hidden",
      thinking: "hidden",
      reasoning: "hidden",
      chain_of_thought: "hidden",
      tool_calls: [
        {
          index: 0,
          id: "call_1",
          function: { name: "get_thread_context", arguments: "{}" },
        },
      ],
    };

    const stripped = stripReasoningFromDelta(delta);

    expect(stripped.content).toBe("Hello");
    expect(stripped.tool_calls).toHaveLength(1);
    for (const key of REASONING_DELTA_KEYS) {
      expect(stripped).not.toHaveProperty(key);
    }
  });

  it("returns empty object for null/undefined delta", () => {
    expect(stripReasoningFromDelta(null)).toEqual({});
    expect(stripReasoningFromDelta(undefined)).toEqual({});
  });

  it("handles reasoning-only chunks with no events", () => {
    const delta = {
      reasoning_details: [{ text: "internal" }],
      thinking: "internal",
    };
    const stripped = stripReasoningFromDelta(delta);
    expect(stripped.content).toBeUndefined();
    expect(stripped.tool_calls).toBeUndefined();
  });
});

describe("assertNoReasoningInText", () => {
  it("passes for clean text", () => {
    expect(() => assertNoReasoningInText('{"type":"text_delta","text":"hello"}')).not.toThrow();
  });

  it("throws when reasoning keys appear in serialized output", () => {
    for (const key of REASONING_DELTA_KEYS) {
      expect(() => assertNoReasoningInText(`{"${key}":"leak"}`)).toThrow();
    }
  });
});
