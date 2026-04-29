import { describe, it, expect } from "vitest";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";

describe("buildDerivationPrompt creativity level", () => {
  it("art_variation + conservative contains CREATIVITY LEVEL: conservative", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "conservative",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: conservative");
  });

  it("art_variation + balanced contains CREATIVITY LEVEL: balanced", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "balanced",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });

  it("art_variation + bold contains CREATIVITY LEVEL: bold", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "bold",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: bold");
  });

  it("format_adaptation + any creativeLevel does NOT contain CREATIVITY LEVEL", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "format_adaptation",
      creativeLevel: "bold",
    });
    expect(prompt).not.toContain("CREATIVITY LEVEL");
  });

  it("art_variation without creativeLevel defaults to balanced", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: balanced");
  });
});
