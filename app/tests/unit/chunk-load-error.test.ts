import { describe, expect, it } from "vitest";
import { isChunkLoadError, isChunkScriptLoadError } from "@/lib/chunk-load-error";

describe("isChunkLoadError", () => {
  it("detects webpack ChunkLoadError by name", () => {
    const error = new Error("Loading chunk 9146 failed.");
    error.name = "ChunkLoadError";
    expect(isChunkLoadError(error)).toBe(true);
  });

  it("detects chunk load failures from message text", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Loading chunk 9146 failed.\n(error: https://adscale.jhonatansoares.com/_next/static/chunks/9146-3da4c126d7239a21.js)"
        )
      )
    ).toBe(true);
  });

  it("detects dynamic import failures", () => {
    expect(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://example.com/chunk.js"))
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("isChunkScriptLoadError", () => {
  it("detects failed script tags for Next.js chunks", () => {
    const script = document.createElement("script");
    script.src = "https://adscale.jhonatansoares.com/_next/static/chunks/9146-3da4c126d7239a21.js";
    const event = new ErrorEvent("error", { error: new Error("script load failed") });
    Object.defineProperty(event, "target", { value: script });

    expect(isChunkScriptLoadError(event)).toBe(true);
  });

  it("ignores non-chunk script failures", () => {
    const script = document.createElement("script");
    script.src = "https://example.com/analytics.js";
    const event = new ErrorEvent("error", { error: new Error("script load failed") });
    Object.defineProperty(event, "target", { value: script });

    expect(isChunkScriptLoadError(event)).toBe(false);
  });
});
