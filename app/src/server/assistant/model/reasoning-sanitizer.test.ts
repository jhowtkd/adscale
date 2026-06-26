import { describe, it, expect } from "vitest";
import {
  REASONING_DELTA_KEYS,
  assertNoReasoningInText,
  stripReasoningFromDelta,
  stripThinkBlocks,
} from "./reasoning-sanitizer";

const O = "\u003Cthink\u003E";
const C = "\u003C/think\u003E";

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

describe("stripThinkBlocks", () => {
  it("returns input unchanged when no think tags are present", () => {
    expect(stripThinkBlocks("oi segredo tchau")).toBe("oi segredo tchau");
  });

  it("returns empty string for empty input", () => {
    expect(stripThinkBlocks("")).toBe("");
  });

  it("strips a single closed think block and keeps surrounding text", () => {
    const input = `oi ${O}segredo interno${C} tchau`;
    expect(stripThinkBlocks(input)).toBe("oi tchau");
  });

  it("strips a closed block leaving only the real answer (leak regression)", () => {
    const leaked = `${O}The user wants to create 5 variations. According to my instructions, when intent is unclear I should ask.${C}Sure! I'll generate 5 variations for you.`;
    expect(stripThinkBlocks(leaked)).toBe(
      "Sure! I'll generate 5 variations for you."
    );
    expect(stripThinkBlocks(leaked)).not.toContain(O);
  });

  it("strips a leading closed block entirely", () => {
    const input = `${O}reasoning here${C}resposta visível`;
    expect(stripThinkBlocks(input)).toBe("resposta visível");
  });

  it("strips a trailing closed block entirely", () => {
    const input = `resposta visível${O}reasoning here${C}`;
    expect(stripThinkBlocks(input)).toBe("resposta visível");
  });

  it("strips multiple closed blocks in one string", () => {
    const input = `a${O}1${C}b${O}2${C}c`;
    const out = stripThinkBlocks(input);
    expect(out).not.toContain(O);
    expect(out).not.toContain(C);
    expect(out).toBe("abc");
  });

  it("strips a truncated unclosed block at the end (stream cut mid-thinking)", () => {
    const input = `resposta${O}reasoning that never closes`;
    expect(stripThinkBlocks(input)).toBe("resposta");
    expect(stripThinkBlocks(input)).not.toContain(O);
  });

  it("strips a truncated block that lost its opening tag (only closing tag present)", () => {
    const input = `reasoning that lost its opening tag${C}resposta`;
    expect(stripThinkBlocks(input)).toBe("resposta");
  });

  it("leaves non-think angle-bracket content untouched", () => {
    const input = "use <strong>bold</strong> not think tags";
    expect(stripThinkBlocks(input)).toBe("use <strong>bold</strong> not think tags");
  });

  it("collapses leftover double whitespace from removed blocks", () => {
    const input = `keep  a${O}x${C}  b`;
    expect(stripThinkBlocks(input)).toBe("keep a b");
  });

  it("never leaves a think tag in the output across mixed cases", () => {
    const cases = [
      `${O}a${C}b${O}c`,
      `d${C}e${O}f${C}g`,
      `${O}only thinking${C}`,
      "plain",
      "",
      `${O}unclosed`,
      `orphan close${C}`,
    ];
    for (const c of cases) {
      const out = stripThinkBlocks(c);
      expect(out).not.toContain(O);
      expect(out).not.toContain(C);
    }
  });
});
