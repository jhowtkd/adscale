import { describe, expect, it } from "vitest";
import { buildBrandMemoryPromptBlock } from "./brand-memory-context";

describe("brand memory context", () => {
  it("formats learned memory as auxiliary prompt context", () => {
    const block = buildBrandMemoryPromptBlock([
      { source: "fact", text: "Acme favors direct CTA buttons." },
      { source: "episode", text: "Rejected variants were too abstract." },
    ]);

    expect(block).toContain("BRAND MEMORY / LEARNED CONTEXT");
    expect(block).toContain("- Acme favors direct CTA buttons.");
    expect(block).toContain("auxiliary context only");
    expect(block).toContain("must not override the literal CTA");
  });

  it("returns an empty string when no useful items exist", () => {
    expect(buildBrandMemoryPromptBlock([])).toBe("");
  });
});

