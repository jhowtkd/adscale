// Provider resolution from model id prefixes (#588).

import { describe, expect, it } from "vitest";
import { resolveEquipeProvider } from "./provider";

describe("resolveEquipeProvider", () => {
  it("routes claude-* models to Anthropic", () => {
    expect(resolveEquipeProvider("claude-opus-5-5")).toBe("anthropic");
    expect(resolveEquipeProvider("claude-haiku-4-5")).toBe("anthropic");
  });

  it("routes muse-* models to Meta", () => {
    expect(resolveEquipeProvider("muse-spark-1.3-contributor")).toBe("meta");
    expect(resolveEquipeProvider("muse-spark-1.3")).toBe("meta");
  });

  it("routes anything else to OpenAI", () => {
    expect(resolveEquipeProvider("gpt-5.6-sol")).toBe("openai");
    expect(resolveEquipeProvider("gpt-4o-mini")).toBe("openai");
    expect(resolveEquipeProvider("future-model-9")).toBe("openai");
    expect(resolveEquipeProvider("")).toBe("openai");
  });

  it("matches prefixes, not substrings", () => {
    expect(resolveEquipeProvider("my-claude-model")).toBe("openai");
    expect(resolveEquipeProvider("my-muse-model")).toBe("openai");
  });
});
